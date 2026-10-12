import { Router } from "express"
import { compare, hash } from "bcrypt"
import { createHash, randomBytes } from "crypto"
import { prisma } from "../db.js"
import { sendPasswordResetEmail } from "../services/mailService.js"
import { forgotPasswordSchema, loginUserSchema, registerUserSchema, resetPasswordSchema } from "../validations/userValidation.js"

const userRouter = Router()
const salt = Number(process.env.SALT)
const passwordResetTokenDuration = 1000 * 60 * 60

const hashToken = (token) => {
    return createHash("sha256").update(token).digest("hex")
}

const getBaseUrl = (req) => {
    return process.env.APP_URL || `${req.protocol}://${req.get("host")}`
}

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

const excerpt = (text, maxLength = 130) => {
    if (!text) {
        return ""
    }

    return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text
}

userRouter.use(async (req, res, next) => {
    if (!req.session?.userId) {
        res.locals.currentUser = null
        return next()
    }

    try {
        const user = await prisma.user.findUnique({
            where: {
                id: Number(req.session.userId),
            },
        })

        res.locals.currentUser = user
        req.user = user
        next()
    } catch (error) {
        console.log(error)
        res.locals.currentUser = null
        next()
    }
})

userRouter.get("/", (req, res) => {
    res.redirect("/dashboard")
})

userRouter.get("/register", (req, res) => {
    res.render("pages/register.twig")
})

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

        await prisma.user.create({
            data: {
                firstname,
                lastname,
                username,
                email,
                password: hashedPassword,
            },
        })

        res.redirect("/login")
    } catch (error) {
        console.log(error)
        res.render("pages/register.twig", {
            error: "Une erreur est survenue pendant la creation du compte.",
            values,
        })
    }
})

userRouter.get("/login", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/dashboard")
    }

    res.render("pages/login.twig")
})

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

userRouter.get("/forgot-password", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/dashboard")
    }

    res.render("pages/forgot-password.twig")
})

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

userRouter.get("/dashboard", async (req, res) => {
    try {
        const userId = req.user?.id
        const [
            totalProducts,
            totalOpinions,
            totalComments,
            averageNote,
            latestProducts,
            latestOpinions,
            latestComments,
            userProducts,
            userOpinions,
            userComments,
            userLikedOpinions,
            userLikedComments,
        ] = await Promise.all([
            prisma.product.count(),
            prisma.opinion.count(),
            prisma.comment.count(),
            prisma.opinion.aggregate({
                _avg: {
                    note: true,
                },
            }),
            prisma.product.findMany({
                take: 4,
                orderBy: {
                    id: "desc",
                },
                include: {
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
                take: 5,
                orderBy: {
                    id: "desc",
                },
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

        const opinions = latestOpinions.map((opinion) => ({
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

userRouter.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login")
    })
})

export default userRouter
