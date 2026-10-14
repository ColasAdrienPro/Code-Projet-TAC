import { Router } from "express"
import { compare, hash } from "bcrypt"
import { createHash, randomBytes, randomInt } from "crypto"
import { prisma } from "../db.js"
import { authguard } from "../middleware/authguard.js"
import { sendAccountVerificationEmail, sendPasswordResetEmail } from "../services/mailService.js"
import { forgotPasswordSchema, loginUserSchema, registerUserSchema, resendVerificationCodeSchema, resetPasswordSchema, verifyAccountSchema } from "../validations/userValidation.js"

const userRouter = Router()
const salt = Number(process.env.SALT)
const passwordResetTokenDuration = 1000 * 60 * 60
const accountVerificationCodeDuration = 1000 * 60 * 15
const maxVerificationAttempts = 5

// Transforme un token ou un code en hash pour le stocker sans garder la valeur brute.
const hashToken = (token) => {
    return createHash("sha256").update(token).digest("hex")
}

// Genere un code numerique a 6 chiffres pour la verification de compte.
const generateVerificationCode = () => {
    return randomInt(100000, 1000000).toString()
}

// Cree un nouveau code de verification pour l'utilisateur et l'envoie par email.
const createAndSendVerificationCode = async (user) => {
    await prisma.accountVerificationCode.deleteMany({
        where: {
            userId: user.id,
        },
    })

    const code = generateVerificationCode()

    await prisma.accountVerificationCode.create({
        data: {
            codeHash: hashToken(code),
            expiresAt: new Date(Date.now() + accountVerificationCodeDuration),
            userId: user.id,
        },
    })

    await sendAccountVerificationEmail({
        to: user.email,
        code,
    })
}

// Construit l'URL de base utilisee dans les liens envoyes par email.
const getBaseUrl = (req) => {
    return process.env.APP_URL || `${req.protocol}://${req.get("host")}`
}

// Formate une date en libelle lisible pour l'affichage en francais.
const formatDate = (date) => {
    if (!date) {
        return ""
    }

    return new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(date)
}

// Coupe un texte trop long pour obtenir un apercu court.
const excerpt = (text, maxLength = 130) => {
    if (!text) {
        return ""
    }

    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

// Convertit une valeur de requete en numero de page positif.
const getPositivePage = (value) => {
    const page = Number(value)

    return Number.isInteger(page) && page > 0 ? page : 1
}

// Recupere toutes les categories triees par nom.
const getCategories = () => {
    return prisma.category.findMany({
        orderBy: {
            name: "asc",
        },
    })
}

// Indique si un utilisateur peut moderer les produits en attente.
const canModerateProducts = (user) => ["admin", "modo"].includes(user?.role)

// Charge l'utilisateur connecte dans les variables disponibles pour toutes les vues.
userRouter.use(async (req, res, next) => {
    if (!req.session?.userId) {
        res.locals.currentUser = null
        res.locals.pendingProductCount = 0
        return next()
    }

    try {
        const user = await prisma.user.findUnique({
            where: {
                id: Number(req.session.userId),
            },
        })

        res.locals.currentUser = user
        res.locals.pendingProductCount = canModerateProducts(user)
            ? await prisma.product.count({
                where: {
                    status: "pending",
                },
            })
            : 0
        req.user = user
        next()
    } catch (error) {
        console.log(error)
        res.locals.currentUser = null
        res.locals.pendingProductCount = 0
        next()
    }
})

// Redirige la page d'accueil vers le dashboard principal.
userRouter.get("/", (req, res) => {
    res.redirect("/dashboard")
})

// Affiche le formulaire d'inscription.
userRouter.get("/register", (req, res) => {
    res.render("pages/register.twig")
})

// Cree un compte utilisateur apres validation du formulaire d'inscription.
userRouter.post("/register", async (req,res)=>{
    const validation = registerUserSchema.safeParse(req.body)
    const values = {
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        username: req.body.username,
        email: req.body.email,
    }

    if (!validation.success) {
        return res.render("pages/register.twig", {
            error: validation.error.issues[0].message,
            values,
        })
    }

    const { firstname, lastname, username, email, password } = validation.data

    try {
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { username },
                ],
            },
        })

        if (existingUser) {
            const error = existingUser.email === email
                ? "Un compte existe deja avec cet email."
                : "Ce pseudo est deja utilise."

            return res.render("pages/register.twig", {
                error,
                values,
            })
        }

        const hashedPassword = await hash(password, salt)

        const user = await prisma.user.create({
            data: {
                firstname,
                lastname,
                username,
                email,
                password: hashedPassword,
            },
        })

        try {
            await createAndSendVerificationCode(user)
        } catch (error) {
            console.log(error)

            return res.render("pages/verify-account.twig", {
                error: "Votre compte a ete cree, mais l'email de verification n'a pas pu etre envoye. Essayez de renvoyer un code.",
                values: {
                    email: user.email,
                },
            })
        }

        res.render("pages/verify-account.twig", {
            success: "Votre compte a ete cree. Un code de verification vient de vous etre envoye par email.",
            values: {
                email: user.email,
            },
        })
    } catch (error) {
        console.log(error)
        res.render("pages/register.twig", {
            error: "Une erreur est survenue pendant la creation du compte.",
            values,
        })
    }
})

// Affiche la page de verification de compte.
userRouter.get("/verify-account", (req, res) => {
    if (req.session.userId && req.user?.is_verified) {
        return res.redirect("/dashboard")
    }

    res.render("pages/verify-account.twig", {
        success: req.query.sent === "1" ? "Un code de verification vient de vous etre envoye par email." : null,
        values: {
            email: req.user?.email || (typeof req.query.email === "string" ? req.query.email : ""),
        },
    })
})

// Verifie le code recu par email et active le compte utilisateur.
userRouter.post("/verify-account", async (req, res) => {
    const validation = verifyAccountSchema.safeParse(req.body)
    const values = {
        email: req.body.email,
    }

    if (!validation.success) {
        return res.render("pages/verify-account.twig", {
            error: validation.error.issues[0].message,
            values,
        })
    }

    const { email, code } = validation.data

    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                accountVerificationCodes: {
                    orderBy: {
                        createdAt: "desc",
                    },
                    take: 1,
                },
            },
        })

        if (!user) {
            return res.render("pages/verify-account.twig", {
                error: "Aucun compte ne correspond a cet email.",
                values,
            })
        }

        if (user.is_verified) {
            return res.render("pages/login.twig", {
                success: "Votre compte est deja verifie. Vous pouvez vous connecter.",
                values: {
                    email: user.email,
                },
            })
        }

        const verificationCode = user.accountVerificationCodes[0]

        if (!verificationCode || verificationCode.expiresAt < new Date()) {
            return res.render("pages/verify-account.twig", {
                error: "Ce code est invalide ou expire. Demandez un nouveau code.",
                values,
            })
        }

        if (verificationCode.attempts >= maxVerificationAttempts) {
            return res.render("pages/verify-account.twig", {
                error: "Trop de tentatives. Demandez un nouveau code.",
                values,
            })
        }

        if (verificationCode.codeHash !== hashToken(code)) {
            await prisma.accountVerificationCode.update({
                where: {
                    id: verificationCode.id,
                },
                data: {
                    attempts: {
                        increment: 1,
                    },
                },
            })

            return res.render("pages/verify-account.twig", {
                error: "Le code saisi est incorrect.",
                values,
            })
        }

        await prisma.$transaction([
            prisma.user.update({
                where: {
                    id: user.id,
                },
                data: {
                    is_verified: true,
                },
            }),
            prisma.accountVerificationCode.deleteMany({
                where: {
                    userId: user.id,
                },
            }),
        ])

        res.render("pages/login.twig", {
            success: "Votre compte est verifie. Vous pouvez maintenant vous connecter.",
            values: {
                email: user.email,
            },
        })
    } catch (error) {
        console.log(error)
        res.render("pages/verify-account.twig", {
            error: "Impossible de verifier ce code pour le moment.",
            values,
        })
    }
})

// Renvoie un nouveau code de verification a l'utilisateur.
userRouter.post("/verify-account/resend", async (req, res) => {
    const validation = resendVerificationCodeSchema.safeParse(req.body)
    const values = {
        email: req.body.email,
    }

    if (!validation.success) {
        return res.render("pages/verify-account.twig", {
            error: validation.error.issues[0].message,
            values,
        })
    }

    const { email } = validation.data

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        })

        if (!user) {
            return res.render("pages/verify-account.twig", {
                error: "Aucun compte ne correspond a cet email.",
                values,
            })
        }

        if (user.is_verified) {
            return res.render("pages/login.twig", {
                success: "Votre compte est deja verifie. Vous pouvez vous connecter.",
                values,
            })
        }

        await createAndSendVerificationCode(user)

        res.render("pages/verify-account.twig", {
            success: "Un nouveau code de verification vient de vous etre envoye.",
            values,
        })
    } catch (error) {
        console.log(error)
        res.render("pages/verify-account.twig", {
            error: "Impossible d'envoyer un nouveau code pour le moment.",
            values,
        })
    }
})

// Permet a un utilisateur connecte de demander un code de verification.
userRouter.post("/request-account-verification", authguard, async (req, res) => {
    try {
        if (req.user.is_verified) {
            return res.redirect("/user-dashboard?verification=already-verified")
        }

        await createAndSendVerificationCode(req.user)

        res.redirect(`/verify-account?email=${encodeURIComponent(req.user.email)}&sent=1`)
    } catch (error) {
        console.log(error)
        res.redirect("/user-dashboard?verification=send-error")
    }
})

// Affiche le formulaire de connexion si l'utilisateur n'est pas deja connecte.
userRouter.get("/login", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/dashboard")
    }

    res.render("pages/login.twig")
})

// Connecte l'utilisateur apres verification de son email et de son mot de passe.
userRouter.post("/login", async (req, res) => {
    const validation = loginUserSchema.safeParse(req.body)
    const values = {
        email: req.body.email,
    }

    if (!validation.success) {
        return res.render("pages/login.twig", {
            error: validation.error.issues[0].message,
            values,
        })
    }

    const { email, password } = validation.data

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        })

        if (!user) {
            return res.render("pages/login.twig", {
                error: "Email ou mot de passe incorrect.",
                values,
            })
        }

        const passwordIsValid = await compare(password, user.password)

        if (!passwordIsValid) {
            return res.render("pages/login.twig", {
                error: "Email ou mot de passe incorrect.",
                values,
            })
        }

        req.session.userId = user.id
        res.redirect("/dashboard")
    } catch (error) {
        console.log(error)
        res.render("pages/login.twig", {
            error: "Une erreur est survenue pendant la connexion.",
            values,
        })
    }
})

// Affiche le formulaire de demande de reinitialisation de mot de passe.
userRouter.get("/forgot-password", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/dashboard")
    }

    res.render("pages/forgot-password.twig")
})

// Cree un token de reinitialisation et envoie le lien par email si le compte existe.
userRouter.post("/forgot-password", async (req, res) => {
    const validation = forgotPasswordSchema.safeParse(req.body)
    const values = {
        email: req.body.email,
    }

    if (!validation.success) {
        return res.render("pages/forgot-password.twig", {
            error: validation.error.issues[0].message,
            values,
        })
    }

    const { email } = validation.data
    const successMessage = "Si un compte existe avec cet email, un lien de reinitialisation vient d'etre envoye."

    try {
        const user = await prisma.user.findUnique({
            where: { email },
        })

        if (user) {
            await prisma.passwordResetToken.deleteMany({
                where: {
                    userId: user.id,
                },
            })

            const token = randomBytes(32).toString("hex")
            const tokenHash = hashToken(token)
            const expiresAt = new Date(Date.now() + passwordResetTokenDuration)

            await prisma.passwordResetToken.create({
                data: {
                    tokenHash,
                    expiresAt,
                    userId: user.id,
                },
            })

            const resetUrl = `${getBaseUrl(req)}/reset-password/${token}`

            await sendPasswordResetEmail({
                to: user.email,
                resetUrl,
            })
        }

        res.render("pages/forgot-password.twig", {
            success: successMessage,
            values: {},
        })
    } catch (error) {
        console.log(error)
        res.render("pages/forgot-password.twig", {
            error: "Impossible d'envoyer l'email de reinitialisation pour le moment.",
            values,
        })
    }
})

// Affiche le formulaire de nouveau mot de passe si le token est encore valide.
userRouter.get("/reset-password/:token", async (req, res) => {
    try {
        const passwordResetToken = await prisma.passwordResetToken.findUnique({
            where: {
                tokenHash: hashToken(req.params.token),
            },
        })

        if (!passwordResetToken || passwordResetToken.expiresAt < new Date()) {
            return res.render("pages/reset-password.twig", {
                error: "Ce lien de reinitialisation est invalide ou expire.",
                tokenIsValid: false,
            })
        }

        res.render("pages/reset-password.twig", {
            token: req.params.token,
            tokenIsValid: true,
        })
    } catch (error) {
        console.log(error)
        res.render("pages/reset-password.twig", {
            error: "Impossible de verifier ce lien pour le moment.",
            tokenIsValid: false,
        })
    }
})

// Met a jour le mot de passe associe a un token de reinitialisation valide.
userRouter.post("/reset-password/:token", async (req, res) => {
    const token = req.params.token
    const validation = resetPasswordSchema.safeParse(req.body)

    if (!validation.success) {
        return res.render("pages/reset-password.twig", {
            error: validation.error.issues[0].message,
            token,
            tokenIsValid: true,
        })
    }

    try {
        const passwordResetToken = await prisma.passwordResetToken.findUnique({
            where: {
                tokenHash: hashToken(token),
            },
        })

        if (!passwordResetToken || passwordResetToken.expiresAt < new Date()) {
            return res.render("pages/reset-password.twig", {
                error: "Ce lien de reinitialisation est invalide ou expire.",
                tokenIsValid: false,
            })
        }

        const hashedPassword = await hash(validation.data.password, salt)

        await prisma.$transaction([
            prisma.user.update({
                where: {
                    id: passwordResetToken.userId,
                },
                data: {
                    password: hashedPassword,
                },
            }),
            prisma.passwordResetToken.deleteMany({
                where: {
                    userId: passwordResetToken.userId,
                },
            }),
        ])

        res.render("pages/login.twig", {
            success: "Votre mot de passe a ete modifie. Vous pouvez vous connecter.",
            values: {},
        })
    } catch (error) {
        console.log(error)
        res.render("pages/reset-password.twig", {
            error: "Impossible de modifier le mot de passe pour le moment.",
            token,
            tokenIsValid: true,
        })
    }
})

// Affiche le dashboard public avec les statistiques et les derniers contenus.
userRouter.get("/dashboard", async (req, res) => {
    try {
        const userId = req.user?.id
        const publicProductWhere = {
            status: "public",
        }
        const publicOpinionWhere = {
            product: publicProductWhere,
        }
        const publicCommentWhere = {
            opinion: publicOpinionWhere,
        }
        const [
            totalProducts,
            totalOpinions,
            totalComments,
            averageNote,
            latestProducts,
            popularOpinions,
            latestComments,
            userProducts,
            userOpinions,
            userComments,
            userLikedOpinions,
            userLikedComments,
        ] = await Promise.all([
            prisma.product.count({ where: publicProductWhere }),
            prisma.opinion.count({ where: publicOpinionWhere }),
            prisma.comment.count({ where: publicCommentWhere }),
            prisma.opinion.aggregate({
                where: publicOpinionWhere,
                _avg: {
                    note: true,
                },
            }),
            prisma.product.findMany({
                take: 4,
                where: publicProductWhere,
                orderBy: {
                    id: "desc",
                },
                include: {
                    category: true,
                    user: true,
                    opinions: true,
                    _count: {
                        select: {
                            opinions: true,
                        },
                    },
                },
            }),
            prisma.opinion.findMany({
                take: 10,
                where: publicOpinionWhere,
                orderBy: [
                    {
                        comments: {
                            _count: "desc",
                        },
                    },
                    {
                        likedBy: {
                            _count: "desc",
                        },
                    },
                    {
                        id: "desc",
                    },
                ],
                include: {
                    user: true,
                    product: true,
                    _count: {
                        select: {
                            comments: true,
                            likedBy: true,
                        },
                    },
                },
            }),
            prisma.comment.findMany({
                take: 4,
                where: publicCommentWhere,
                orderBy: {
                    id: "desc",
                },
                include: {
                    user: true,
                    opinion: {
                        include: {
                            product: true,
                        },
                    },
                    _count: {
                        select: {
                            likedBy: true,
                        },
                    },
                },
            }),
            userId ? prisma.product.count({ where: { user_id: userId } }) : Promise.resolve(0),
            userId ? prisma.opinion.count({ where: { user_id: userId } }) : Promise.resolve(0),
            userId ? prisma.comment.count({ where: { user_id: userId } }) : Promise.resolve(0),
            userId ? prisma.usersLikedOpinion.count({ where: { user_id: userId } }) : Promise.resolve(0),
            userId ? prisma.usersLikedComment.count({ where: { user_id: userId } }) : Promise.resolve(0),
        ])

        const products = latestProducts.map((product) => {
            const notes = product.opinions.map((opinion) => opinion.note)
            const average = notes.length
                ? notes.reduce((total, note) => total + note, 0) / notes.length
                : null

            return {
                ...product,
                releaseDateLabel: formatDate(product.release_date),
                descriptionPreview: excerpt(product.description),
                averageNote: average ? average.toFixed(1) : null,
            }
        })

        const opinions = popularOpinions.map((opinion) => ({
            ...opinion,
            textPreview: excerpt(opinion.text, 150),
        }))

        const comments = latestComments.map((comment) => ({
            ...comment,
            textPreview: excerpt(comment.text, 120),
        }))

        res.render("pages/dashboard.twig", {
            user: req.user,
            stats: {
                products: totalProducts,
                opinions: totalOpinions,
                comments: totalComments,
                averageNote: averageNote._avg.note ? averageNote._avg.note.toFixed(1) : "0",
            },
            userStats: {
                products: userProducts,
                opinions: userOpinions,
                comments: userComments,
                likes: userLikedOpinions + userLikedComments,
            },
            products,
            opinions,
            comments,
        })
    } catch (error) {
        console.log(error)
        res.render("pages/dashboard.twig", {
            user: req.user,
            stats: {
                products: 0,
                opinions: 0,
                comments: 0,
                averageNote: "0",
            },
            userStats: {
                products: 0,
                opinions: 0,
                comments: 0,
                likes: 0,
            },
            products: [],
            opinions: [],
            comments: [],
            error: "Impossible de charger les donnees du dashboard.",
        })
    }
})

// Affiche l'espace personnel de l'utilisateur avec ses produits, avis et commentaires.
userRouter.get("/user-dashboard", authguard, async (req, res) => {
    const userId = req.user.id
    const pageSize = 5
    const search = typeof req.query.search === "string" ? req.query.search.trim() : ""
    const categoryId = Number(req.query.category)
    const selectedCategoryId = Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null
    const productsPage = getPositivePage(req.query.productsPage)
    const opinionsPage = getPositivePage(req.query.opinionsPage)
    const commentsPage = getPositivePage(req.query.commentsPage)
    const queryBase = `search=${encodeURIComponent(search)}&category=${selectedCategoryId || ""}`

    const productWhere = {
        user_id: userId,
        ...(selectedCategoryId ? { category_id: selectedCategoryId } : {}),
        ...(search
            ? {
                OR: [
                    { title: { contains: search } },
                    { description: { contains: search } },
                    { category: { name: { contains: search } } },
                ],
            }
            : {}),
    }

    const opinionWhere = {
        user_id: userId,
        ...(selectedCategoryId
            ? {
                product: {
                    category_id: selectedCategoryId,
                },
            }
            : {}),
        ...(search
            ? {
                OR: [
                    { title: { contains: search } },
                    { text: { contains: search } },
                    { product: { title: { contains: search } } },
                    { product: { category: { name: { contains: search } } } },
                ],
            }
            : {}),
    }

    const commentWhere = {
        user_id: userId,
        ...(selectedCategoryId
            ? {
                opinion: {
                    product: {
                        category_id: selectedCategoryId,
                    },
                },
            }
            : {}),
        ...(search
            ? {
                OR: [
                    { title: { contains: search } },
                    { text: { contains: search } },
                    { opinion: { title: { contains: search } } },
                    { opinion: { product: { title: { contains: search } } } },
                    { opinion: { product: { category: { name: { contains: search } } } } },
                ],
            }
            : {}),
    }

    try {
        const [
            categories,
            productCount,
            opinionCount,
            commentCount,
            userProducts,
            userOpinions,
            userComments,
            mostCommentedOpinions,
            mostLikedComments,
        ] = await Promise.all([
            getCategories(),
            prisma.product.count({ where: productWhere }),
            prisma.opinion.count({ where: opinionWhere }),
            prisma.comment.count({ where: commentWhere }),
            prisma.product.findMany({
                take: pageSize,
                skip: (productsPage - 1) * pageSize,
                where: productWhere,
                orderBy: {
                    id: "desc",
                },
                include: {
                    category: true,
                    opinions: true,
                    _count: {
                        select: {
                            opinions: true,
                        },
                    },
                },
            }),
            prisma.opinion.findMany({
                take: pageSize,
                skip: (opinionsPage - 1) * pageSize,
                where: opinionWhere,
                orderBy: {
                    id: "desc",
                },
                include: {
                    product: {
                        include: {
                            category: true,
                        },
                    },
                    _count: {
                        select: {
                            comments: true,
                            likedBy: true,
                        },
                    },
                },
            }),
            prisma.comment.findMany({
                take: pageSize,
                skip: (commentsPage - 1) * pageSize,
                where: commentWhere,
                orderBy: {
                    id: "desc",
                },
                include: {
                    opinion: {
                        include: {
                            product: {
                                include: {
                                    category: true,
                                },
                            },
                        },
                    },
                    _count: {
                        select: {
                            likedBy: true,
                        },
                    },
                },
            }),
            prisma.opinion.findMany({
                take: 5,
                where: {
                    user_id: userId,
                },
                orderBy: [
                    {
                        comments: {
                            _count: "desc",
                        },
                    },
                    {
                        id: "desc",
                    },
                ],
                include: {
                    product: true,
                    _count: {
                        select: {
                            comments: true,
                            likedBy: true,
                        },
                    },
                },
            }),
            prisma.comment.findMany({
                take: 5,
                where: {
                    user_id: userId,
                },
                orderBy: [
                    {
                        likedBy: {
                            _count: "desc",
                        },
                    },
                    {
                        id: "desc",
                    },
                ],
                include: {
                    opinion: {
                        include: {
                            product: true,
                        },
                    },
                    _count: {
                        select: {
                            likedBy: true,
                        },
                    },
                },
            }),
        ])

        const products = userProducts.map((product) => {
            const notes = product.opinions.map((opinion) => opinion.note)
            const average = notes.length
                ? notes.reduce((total, note) => total + note, 0) / notes.length
                : null

            return {
                ...product,
                releaseDateLabel: formatDate(product.release_date),
                descriptionPreview: excerpt(product.description, 120),
                averageNote: average ? average.toFixed(1) : null,
            }
        })

        const opinions = userOpinions.map((opinion) => ({
            ...opinion,
            textPreview: excerpt(opinion.text, 150),
        }))

        const comments = userComments.map((comment) => ({
            ...comment,
            textPreview: excerpt(comment.text, 130),
        }))

        res.render("pages/user-dashboard.twig", {
            user: req.user,
            categories,
            products,
            opinions,
            comments,
            success: req.query.verification === "already-verified"
                ? "Votre compte est deja verifie."
                : req.query.product === "pending"
                    ? "Votre produit a ete envoye en validation. Il sera public apres verification par un administrateur ou un moderateur."
                    : null,
            error: req.query.verification === "send-error" ? "Impossible d'envoyer le code de verification pour le moment." : null,
            mostCommentedOpinions: mostCommentedOpinions.map((opinion) => ({
                ...opinion,
                textPreview: excerpt(opinion.text, 120),
            })),
            mostLikedComments: mostLikedComments.map((comment) => ({
                ...comment,
                textPreview: excerpt(comment.text, 120),
            })),
            filters: {
                search,
                categoryId: selectedCategoryId,
                hasFilters: Boolean(search || selectedCategoryId),
                queryBase,
            },
            pagination: {
                pageSize,
                products: {
                    current: productsPage,
                    total: productCount,
                    totalPages: Math.max(Math.ceil(productCount / pageSize), 1),
                },
                opinions: {
                    current: opinionsPage,
                    total: opinionCount,
                    totalPages: Math.max(Math.ceil(opinionCount / pageSize), 1),
                },
                comments: {
                    current: commentsPage,
                    total: commentCount,
                    totalPages: Math.max(Math.ceil(commentCount / pageSize), 1),
                },
            },
        })
    } catch (error) {
        console.log(error)
        res.render("pages/user-dashboard.twig", {
            user: req.user,
            categories: [],
            products: [],
            opinions: [],
            comments: [],
            mostCommentedOpinions: [],
            mostLikedComments: [],
            filters: {
                search: "",
                categoryId: null,
                hasFilters: false,
                queryBase: "search=&category=",
            },
            pagination: {
                pageSize,
                products: { current: 1, total: 0, totalPages: 1 },
                opinions: { current: 1, total: 0, totalPages: 1 },
                comments: { current: 1, total: 0, totalPages: 1 },
            },
            error: "Impossible de charger votre espace utilisateur.",
        })
    }
})

// Deconnecte l'utilisateur en detruisant sa session.
userRouter.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login")
    })
})

export default userRouter
