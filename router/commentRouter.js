import { Router } from "express"
import { prisma } from "../db.js"
import { authguard } from "../middleware/authguard.js"
import { commentSchema } from "../validations/commentValidation.js"

const commentRouter = Router()

// Convertit une valeur en identifiant positif utilisable en base de donnees.
const getId = (value) => {
    const id = Number(value)

    return Number.isInteger(id) && id > 0 ? id : null
}

// Extrait l'identifiant principal depuis les parametres de route.
const getRouteId = (req) => getId(req.params.id)

// Indique si un produit est visible publiquement.
const productIsPublic = (product) => product?.status === "public"

// Indique si un utilisateur peut moderer les contenus.
const canModerateContent = (user) => ["admin", "modo"].includes(user?.role)

// Detecte si la requete attend une reponse JSON.
const wantsJson = (req) => req.get("accept")?.includes("application/json")

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

// Recupere un commentaire avec son avis et le produit associe.
const findCommentWithProduct = (commentId) => {
    return prisma.comment.findUnique({
        where: {
            id: commentId,
        },
        include: {
            opinion: {
                include: {
                    product: true,
                },
            },
        },
    })
}

// Cree un commentaire sur un avis associe a un produit public.
commentRouter.post("/opinions/:id/comments", async (req, res) => {
    const opinionId = getRouteId(req)

    if (!opinionId) {
        return res.redirect("/dashboard")
    }

    const validation = commentSchema.safeParse(req.body)

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

        if (!validation.success) {
            return res.redirect(`/products/${opinion.product_id}?commentError=${encodeURIComponent(validation.error.issues[0].message)}#opinion-${opinion.id}`)
        }

        const { title, text } = validation.data

        await prisma.comment.create({
            data: {
                title,
                text,
                opinion_id: opinion.id,
                user_id: req.user?.id || null,
            },
        })

        res.redirect(`/products/${opinion.product_id}#opinion-${opinion.id}`)
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

// Affiche le formulaire de modification d'un commentaire appartenant a l'utilisateur.
commentRouter.get("/comments/:id/edit", authguard, async (req, res) => {
    const commentId = getRouteId(req)

    if (!commentId) {
        return res.redirect("/dashboard")
    }

    try {
        const comment = await findCommentWithProduct(commentId)

        if (!comment || comment.user_id !== req.user.id) {
            return res.redirect("/dashboard")
        }

        res.render("pages/comment-form.twig", {
            title: "Modifier un commentaire",
            action: `/comments/${comment.id}/edit`,
            submitLabel: "Modifier",
            cancelUrl: `/products/${comment.opinion.product_id}#opinion-${comment.opinion_id}`,
            product: comment.opinion.product,
            values: comment,
        })
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

// Enregistre les modifications d'un commentaire appartenant a l'utilisateur.
commentRouter.post("/comments/:id/edit", authguard, async (req, res) => {
    const commentId = getRouteId(req)

    if (!commentId) {
        return res.redirect("/dashboard")
    }

    const validation = commentSchema.safeParse(req.body)

    try {
        const comment = await findCommentWithProduct(commentId)

        if (!comment || comment.user_id !== req.user.id) {
            return res.redirect("/dashboard")
        }

        if (!validation.success) {
            return res.render("pages/comment-form.twig", {
                title: "Modifier un commentaire",
                action: `/comments/${comment.id}/edit`,
                submitLabel: "Modifier",
                cancelUrl: `/products/${comment.opinion.product_id}#opinion-${comment.opinion_id}`,
                product: comment.opinion.product,
                error: validation.error.issues[0].message,
                values: req.body,
            })
        }

        const { title, text } = validation.data

        await prisma.comment.update({
            where: {
                id: comment.id,
            },
            data: {
                title,
                text,
            },
        })

        res.redirect(`/products/${comment.opinion.product_id}#opinion-${comment.opinion_id}`)
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

// Supprime un commentaire si l'utilisateur en est proprietaire ou moderateur.
commentRouter.post("/comments/:id/delete", authguard, async (req, res) => {
    const commentId = getRouteId(req)

    if (!commentId) {
        return res.redirect("/dashboard")
    }

    try {
        const comment = await findCommentWithProduct(commentId)

        if (comment && ((comment.user_id && comment.user_id === req.user.id) || canModerateContent(req.user))) {
            await prisma.comment.delete({
                where: {
                    id: comment.id,
                },
            })

            return res.redirect(getSafeRedirect(req, `/products/${comment.opinion.product_id}`))
        }

        res.redirect("/dashboard")
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

// Ajoute ou retire le like de l'utilisateur sur un commentaire.
commentRouter.post("/comments/:id/like", authguard, async (req, res) => {
    const commentId = getRouteId(req)

    if (!commentId) {
        return res.redirect("/dashboard")
    }

    try {
        const comment = await findCommentWithProduct(commentId)

        if (!comment || !productIsPublic(comment.opinion.product)) {
            return res.redirect("/dashboard")
        }

        const existingLike = await prisma.usersLikedComment.findUnique({
            where: {
                user_id_liked_comment_id: {
                    user_id: req.user.id,
                    liked_comment_id: comment.id,
                },
            },
        })

        if (existingLike) {
            await prisma.usersLikedComment.delete({
                where: {
                    id: existingLike.id,
                },
            })
        } else {
            await prisma.usersLikedComment.create({
                data: {
                    user_id: req.user.id,
                    liked_comment_id: comment.id,
                },
            })
        }

        if (wantsJson(req)) {
            const likeCount = await prisma.usersLikedComment.count({
                where: {
                    liked_comment_id: comment.id,
                },
            })

            return res.json({
                liked: !existingLike,
                likeCount,
            })
        }

        res.redirect(getSafeRedirect(req, `/products/${comment.opinion.product_id}#opinion-${comment.opinion_id}`))
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

export default commentRouter
