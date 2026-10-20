import { Router } from "express"
import { prisma } from "../db.js"
import { authguard } from "../middleware/authguard.js"
import { opinionSchema } from "../validations/opinionValidation.js"

const opinionRouter = Router()

// Convertit une valeur en identifiant positif utilisable en base de donnees.
const getId = (value) => {
    const id = Number(value)

    return Number.isInteger(id) && id > 0 ? id : null
}

// Extrait l'identifiant du produit depuis les parametres de route.
const getProductId = (req) => getId(req.params.productId)

// Extrait l'identifiant de l'avis depuis les parametres de route.
const getOpinionId = (req) => getId(req.params.id)

// Indique si un produit est visible publiquement.
const productIsPublic = (product) => product?.status === "public"

// Indique si un utilisateur peut moderer les contenus.
const canModerateContent = (user) => ["admin", "modo"].includes(user?.role)

// Renvoie vers la page precedente seulement si elle appartient au meme site.
const getSafeRedirect = (req, fallback) => {
    const referer = req.get("referer")

    if (!referer) {
        return fallback
    }

    try {
        const refererUrl = new URL(referer)

        if (refererUrl.host === req.get("host")) {
            return `${refererUrl.pathname}${refererUrl.search}`
        }
    } catch (error) {
        if (referer.startsWith("/") && !referer.startsWith("//")) {
            return referer
        }
    }

    return fallback
}

// Affiche le formulaire de creation ou modification d'un avis.
const renderOpinionForm = (res, options) => {
    res.render("pages/opinion-form.twig", options)
}

// Detecte si la requete attend une reponse JSON.
const wantsJson = (req) => req.get("accept")?.includes("application/json")

// Affiche le formulaire pour ajouter un avis a un produit public.
opinionRouter.get("/products/:productId/opinions/new", authguard, async (req, res) => {
    const productId = getProductId(req)

    if (!productId) {
        return res.redirect("/dashboard")
    }

    try {
        const product = await prisma.product.findUnique({
            where: {
                id: productId,
            },
        })

        if (!product) {
            return res.redirect("/dashboard")
        }

        if (!productIsPublic(product)) {
            return res.redirect(`/products/${product.id}`)
        }

        const existingOpinion = await prisma.opinion.findFirst({
            where: {
                product_id: product.id,
                user_id: req.user.id,
            },
        })

        if (existingOpinion) {
            return res.redirect(`/opinions/${existingOpinion.id}/edit`)
        }

        renderOpinionForm(res, {
            title: "Ajouter un avis",
            action: `/products/${product.id}/opinions`,
            submitLabel: "Publier",
            cancelUrl: `/products/${product.id}`,
            product,
            values: {},
        })
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

// Cree un avis, ou redirige vers la modification si l'utilisateur a deja donne son avis.
opinionRouter.post("/products/:productId/opinions", authguard, async (req, res) => {
    const productId = getProductId(req)

    if (!productId) {
        return res.redirect("/dashboard")
    }

    const validation = opinionSchema.safeParse(req.body)

    try {
        const product = await prisma.product.findUnique({
            where: {
                id: productId,
            },
        })

        if (!product) {
            return res.redirect("/dashboard")
        }

        if (!productIsPublic(product)) {
            return res.redirect(`/products/${product.id}`)
        }

        const existingOpinion = await prisma.opinion.findFirst({
            where: {
                product_id: product.id,
                user_id: req.user.id,
            },
        })

        if (!validation.success) {
            return renderOpinionForm(res, {
                title: existingOpinion ? "Modifier un avis" : "Ajouter un avis",
                action: existingOpinion ? `/opinions/${existingOpinion.id}/edit` : `/products/${product.id}/opinions`,
                submitLabel: existingOpinion ? "Modifier" : "Publier",
                cancelUrl: `/products/${product.id}`,
                product,
                error: validation.error.issues[0].message,
                values: req.body,
            })
        }

        const { note, title, text } = validation.data

        if (existingOpinion) {
            await prisma.opinion.update({
                where: {
                    id: existingOpinion.id,
                },
                data: {
                    note,
                    title,
                    text,
                },
            })

            return res.redirect(`/products/${product.id}`)
        }

        await prisma.opinion.create({
            data: {
                note,
                title,
                text,
                product_id: product.id,
                user_id: req.user.id,
            },
        })

        res.redirect(`/products/${product.id}`)
    } catch (error) {
        console.log(error)
        res.redirect(`/products/${productId}`)
    }
})

// Affiche le formulaire de modification d'un avis appartenant a l'utilisateur.
opinionRouter.get("/opinions/:id/edit", authguard, async (req, res) => {
    const opinionId = getOpinionId(req)

    if (!opinionId) {
        return res.redirect("/user-dashboard")
    }

    try {
        const opinion = await prisma.opinion.findUnique({
            where: {
                id: opinionId,
            },
            include: {
                product: true,
            },
        })

        if (!opinion || opinion.user_id !== req.user.id) {
            return res.redirect("/user-dashboard")
        }

        renderOpinionForm(res, {
            title: "Modifier un avis",
            action: `/opinions/${opinion.id}/edit`,
            submitLabel: "Modifier",
            cancelUrl: `/products/${opinion.product_id}`,
            product: opinion.product,
            values: opinion,
        })
    } catch (error) {
        console.log(error)
        res.redirect("/user-dashboard")
    }
})

// Enregistre les modifications d'un avis appartenant a l'utilisateur.
opinionRouter.post("/opinions/:id/edit", authguard, async (req, res) => {
    const opinionId = getOpinionId(req)

    if (!opinionId) {
        return res.redirect("/user-dashboard")
    }

    const validation = opinionSchema.safeParse(req.body)

    try {
        const opinion = await prisma.opinion.findUnique({
            where: {
                id: opinionId,
            },
            include: {
                product: true,
            },
        })

        if (!opinion || opinion.user_id !== req.user.id) {
            return res.redirect("/user-dashboard")
        }

        if (!validation.success) {
            return renderOpinionForm(res, {
                title: "Modifier un avis",
                action: `/opinions/${opinion.id}/edit`,
                submitLabel: "Modifier",
                cancelUrl: `/products/${opinion.product_id}`,
                product: opinion.product,
                error: validation.error.issues[0].message,
                values: req.body,
            })
        }

        const { note, title, text } = validation.data

        await prisma.opinion.update({
            where: {
                id: opinion.id,
            },
            data: {
                note,
                title,
                text,
            },
        })

        res.redirect(`/products/${opinion.product_id}`)
    } catch (error) {
        console.log(error)
        res.redirect("/user-dashboard")
    }
})

// Supprime un avis si l'utilisateur en est proprietaire ou moderateur.
opinionRouter.post("/opinions/:id/delete", authguard, async (req, res) => {
    const opinionId = getOpinionId(req)

    if (!opinionId) {
        return res.redirect("/user-dashboard")
    }

    try {
        const opinion = await prisma.opinion.findUnique({
            where: {
                id: opinionId,
            },
        })

        if (opinion && (opinion.user_id === req.user.id || canModerateContent(req.user))) {
            await prisma.opinion.delete({
                where: {
                    id: opinion.id,
                },
            })

            return res.redirect(getSafeRedirect(req, `/products/${opinion.product_id}`))
        }

        res.redirect("/user-dashboard")
    } catch (error) {
        console.log(error)
        res.redirect("/user-dashboard")
    }
})

// Ajoute ou retire le like de l'utilisateur sur un avis.
opinionRouter.post("/opinions/:id/like", authguard, async (req, res) => {
    const opinionId = getOpinionId(req)

    if (!opinionId) {
        return res.redirect("/dashboard")
    }

    try {
        const opinion = await prisma.opinion.findUnique({
            where: {
                id: opinionId,
            },
            include: {
                product: true,
            },
        })

        if (!opinion || !productIsPublic(opinion.product)) {
            return res.redirect("/dashboard")
        }

        const existingLike = await prisma.usersLikedOpinion.findUnique({
            where: {
                user_id_opinion_id: {
                    user_id: req.user.id,
                    opinion_id: opinion.id,
                },
            },
        })

        if (existingLike) {
            await prisma.usersLikedOpinion.delete({
                where: {
                    id: existingLike.id,
                },
            })
        } else {
            await prisma.usersLikedOpinion.create({
                data: {
                    user_id: req.user.id,
                    opinion_id: opinion.id,
                },
            })
        }

        if (wantsJson(req)) {
            const likeCount = await prisma.usersLikedOpinion.count({
                where: {
                    opinion_id: opinion.id,
                },
            })

            return res.json({
                liked: !existingLike,
                likeCount,
            })
        }

        res.redirect(getSafeRedirect(req, `/products/${opinion.product_id}#opinion-${opinion.id}`))
    } catch (error) {
        console.log(error)
        if (wantsJson(req)) {
            return res.status(500).json({
                error: "Impossible de modifier ce like.",
            })
        }
        res.redirect("/dashboard")
    }
})

export default opinionRouter
