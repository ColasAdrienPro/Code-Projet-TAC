import { Router } from "express"
import { prisma } from "../db.js"
import { authguard } from "../middleware/authguard.js"
import { productSchema } from "../validations/productValidation.js"

const productRouter = Router()

// Formate une date pour la placer dans un champ input de type date.
const formatInputDate = (date) => {
    if (!date) {
        return ""
    }

    return date.toISOString().slice(0, 10)
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

// Extrait et valide l'identifiant du produit present dans l'URL.
const getProductId = (req) => {
    const productId = Number(req.params.id)

    return Number.isInteger(productId) && productId > 0 ? productId : null
}

// Recupere toutes les categories triees par nom.
const getCategories = () => {
    return prisma.category.findMany({
        orderBy: {
            name: "asc",
        },
    })
}

// Indique si un utilisateur peut moderer les produits.
const canModerateProducts = (user) => ["admin", "modo"].includes(user?.role)

// Bloque l'acces aux pages de moderation pour les utilisateurs non autorises.
const requireProductModerator = (req, res, next) => {
    if (!canModerateProducts(req.user)) {
        return res.redirect("/dashboard")
    }

    next()
}

// Affiche le formulaire produit avec la liste des categories.
const renderProductForm = async (res, options) => {
    const categories = await getCategories()

    res.render("pages/product-form.twig", {
        ...options,
        categories,
    })
}

// Affiche le formulaire de creation d'un produit.
productRouter.get("/products/new", authguard, async (req, res) => {
    await renderProductForm(res, {
        title: "Ajouter un produit",
        action: "/products",
        submitLabel: "Ajouter",
        values: {},
    })
})

// Affiche les derniers produits publics avec recherche et filtre par categorie.
productRouter.get("/products/latest", async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : ""
    const categoryId = Number(req.query.category)
    const selectedCategoryId = Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null
    const productWhere = {
        status: "public",
        ...(selectedCategoryId ? { category_id: selectedCategoryId } : {}),
        ...(search
            ? {
                OR: [
                    {
                        title: {
                            contains: search,
                        },
                    },
                    {
                        description: {
                            contains: search,
                        },
                    },
                    {
                        category: {
                            name: {
                                contains: search,
                            },
                        },
                    },
                ],
            }
            : {}),
    }

    try {
        const [categories, productCount, latestProducts] = await Promise.all([
            getCategories(),
            prisma.product.count({
                where: productWhere,
            }),
            prisma.product.findMany({
                take: 20,
                where: productWhere,
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

        res.render("pages/latest-products.twig", {
            user: req.user,
            products,
            categories,
            filters: {
                search,
                categoryId: selectedCategoryId,
                hasFilters: Boolean(search || selectedCategoryId),
                productCount,
                productLimit: 20,
            },
        })
    } catch (error) {
        console.log(error)
        res.render("pages/latest-products.twig", {
            user: req.user,
            products: [],
            categories: [],
            filters: {
                search: "",
                categoryId: null,
                hasFilters: false,
                productCount: 0,
                productLimit: 20,
            },
            error: "Impossible de charger les derniers produits.",
        })
    }
})

// Affiche la liste des produits en attente de validation.
productRouter.get("/products/validation", authguard, requireProductModerator, async (req, res) => {
    try {
        const pendingProducts = await prisma.product.findMany({
            where: {
                status: "pending",
            },
            orderBy: {
                id: "desc",
            },
            include: {
                category: true,
                user: true,
            },
        })

        const products = pendingProducts.map((product) => ({
            ...product,
            releaseDateLabel: formatDate(product.release_date),
            createdAtLabel: formatDate(product.created_at),
            descriptionPreview: excerpt(product.description, 220),
        }))

        res.render("pages/product-validation.twig", {
            user: req.user,
            products,
            success: req.query.validated === "1"
                ? "Le produit est maintenant public."
                : req.query.deleted === "1"
                    ? "Le produit a ete supprime."
                    : null,
            error: req.query.error === "approve"
                ? "Impossible de valider ce produit pour le moment."
                : req.query.error === "delete"
                    ? "Impossible de supprimer ce produit pour le moment."
                    : null,
        })
    } catch (error) {
        console.log(error)
        res.render("pages/product-validation.twig", {
            user: req.user,
            products: [],
            error: "Impossible de charger les demandes de validation.",
        })
    }
})

// Valide un produit en attente et le rend public.
productRouter.post("/products/:id/approve", authguard, requireProductModerator, async (req, res) => {
    const productId = getProductId(req)

    if (!productId) {
        return res.redirect("/products/validation")
    }

    try {
        await prisma.product.update({
            where: {
                id: productId,
            },
            data: {
                status: "public",
                validated_at: new Date(),
            },
        })

        res.redirect("/products/validation?validated=1")
    } catch (error) {
        console.log(error)
        res.redirect("/products/validation?error=approve")
    }
})

// Supprime un produit depuis l'interface de moderation.
productRouter.post("/products/:id/moderation-delete", authguard, requireProductModerator, async (req, res) => {
    const productId = getProductId(req)

    if (!productId) {
        return res.redirect("/products/validation")
    }

    try {
        await prisma.product.delete({
            where: {
                id: productId,
            },
        })

        res.redirect("/products/validation?deleted=1")
    } catch (error) {
        console.log(error)
        res.redirect("/products/validation?error=delete")
    }
})

// Affiche la fiche detaillee d'un produit avec ses avis et commentaires.
productRouter.get("/products/:id", async (req, res) => {
    const productId = getProductId(req)
    const currentUserId = req.user?.id

    if (!productId) {
        return res.redirect("/dashboard")
    }

    try {
        const product = await prisma.product.findUnique({
            where: {
                id: productId,
            },
            include: {
                category: true,
                user: true,
                opinions: {
                    orderBy: {
                        id: "desc",
                    },
                    include: {
                        user: true,
                        _count: {
                            select: {
                                comments: true,
                                likedBy: true,
                            },
                        },
                        likedBy: currentUserId
                            ? {
                                where: {
                                    user_id: currentUserId,
                                },
                                select: {
                                    id: true,
                                },
                            }
                            : false,
                        comments: {
                            orderBy: {
                                id: "desc",
                            },
                            include: {
                                user: true,
                                _count: {
                                    select: {
                                        likedBy: true,
                                    },
                                },
                                likedBy: currentUserId
                                    ? {
                                        where: {
                                            user_id: currentUserId,
                                        },
                                        select: {
                                            id: true,
                                        },
                                    }
                                    : false,
                            },
                        },
                    },
                },
                _count: {
                    select: {
                        opinions: true,
                    },
                },
            },
        })

        if (!product) {
            return res.redirect("/dashboard")
        }

        const canSeePendingProduct = product.status === "public"
            || product.user_id === req.user?.id
            || canModerateProducts(req.user)

        if (!canSeePendingProduct) {
            return res.redirect("/dashboard")
        }

        const notes = product.opinions.map((opinion) => opinion.note)
        const averageNote = notes.length
            ? (notes.reduce((total, note) => total + note, 0) / notes.length).toFixed(1)
            : null
        const opinions = product.opinions.map((opinion) => ({
            ...opinion,
            isLikedByCurrentUser: Boolean(opinion.likedBy?.length),
            comments: opinion.comments.map((comment) => ({
                ...comment,
                isLikedByCurrentUser: Boolean(comment.likedBy?.length),
            })),
        }))

        res.render("pages/product-detail.twig", {
            product: {
                ...product,
                opinions,
                releaseDateLabel: formatDate(product.release_date),
                averageNote,
            },
            user: req.user,
            commentError: req.query.commentError,
        })
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

// Cree un nouveau produit et le place en attente de validation.
productRouter.post("/products", authguard, async (req, res) => {
    const validation = productSchema.safeParse(req.body)

    if (!validation.success) {
        return renderProductForm(res, {
            title: "Ajouter un produit",
            action: "/products",
            submitLabel: "Ajouter",
            error: validation.error.issues[0].message,
            values: req.body,
        })
    }

    const { title, category_id, image_url, release_date, description } = validation.data

    try {
        const category = await prisma.category.findUnique({
            where: {
                id: category_id,
            },
        })

        if (!category) {
            return renderProductForm(res, {
                title: "Ajouter un produit",
                action: "/products",
                submitLabel: "Ajouter",
                error: "La categorie selectionnee n'existe pas.",
                values: req.body,
            })
        }

        await prisma.product.create({
            data: {
                title,
                category_id,
                image_url,
                release_date: new Date(release_date),
                description,
                user_id: req.user.id,
                status: "pending",
            },
        })

        res.redirect("/user-dashboard?product=pending")
    } catch (error) {
        console.log(error)
        await renderProductForm(res, {
            title: "Ajouter un produit",
            action: "/products",
            submitLabel: "Ajouter",
            error: "Impossible d'ajouter le produit pour le moment.",
            values: req.body,
        })
    }
})

// Affiche le formulaire de modification d'un produit appartenant a l'utilisateur.
productRouter.get("/products/:id/edit", authguard, async (req, res) => {
    const productId = getProductId(req)

    if (!productId) {
        return res.redirect("/dashboard")
    }

    try {
        const product = await prisma.product.findUnique({
            where: {
                id: productId,
            },
            include: {
                category: true,
            },
        })

        if (!product) {
            return res.redirect("/dashboard")
        }

        if (product.user_id !== req.user.id) {
            return res.redirect("/dashboard")
        }

        await renderProductForm(res, {
            title: "Modifier un produit",
            action: `/products/${product.id}/edit`,
            submitLabel: "Modifier",
            values: {
                ...product,
                category_id: product.category_id,
                release_date: formatInputDate(product.release_date),
            },
        })
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

// Enregistre les modifications d'un produit appartenant a l'utilisateur.
productRouter.post("/products/:id/edit", authguard, async (req, res) => {
    const productId = getProductId(req)

    if (!productId) {
        return res.redirect("/dashboard")
    }

    const validation = productSchema.safeParse(req.body)

    if (!validation.success) {
        return renderProductForm(res, {
            title: "Modifier un produit",
            action: `/products/${productId}/edit`,
            submitLabel: "Modifier",
            error: validation.error.issues[0].message,
            values: req.body,
        })
    }

    const { title, category_id, image_url, release_date, description } = validation.data

    try {
        const [product, category] = await Promise.all([
            prisma.product.findUnique({
                where: {
                    id: productId,
                },
            }),
            prisma.category.findUnique({
                where: {
                    id: category_id,
                },
            }),
        ])

        if (!product || product.user_id !== req.user.id) {
            return res.redirect("/dashboard")
        }

        if (!category) {
            return renderProductForm(res, {
                title: "Modifier un produit",
                action: `/products/${productId}/edit`,
                submitLabel: "Modifier",
                error: "La categorie selectionnee n'existe pas.",
                values: req.body,
            })
        }

        await prisma.product.update({
            where: {
                id: productId,
            },
            data: {
                title,
                category_id,
                image_url,
                release_date: new Date(release_date),
                description,
            },
        })

        res.redirect("/dashboard")
    } catch (error) {
        console.log(error)
        await renderProductForm(res, {
            title: "Modifier un produit",
            action: `/products/${productId}/edit`,
            submitLabel: "Modifier",
            error: "Impossible de modifier le produit pour le moment.",
            values: req.body,
        })
    }
})

// Supprime un produit si l'utilisateur en est proprietaire ou moderateur.
productRouter.post("/products/:id/delete", authguard, async (req, res) => {
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

        if (product && (product.user_id === req.user.id || canModerateProducts(req.user))) {
            await prisma.product.delete({
                where: {
                    id: productId,
                },
            })
        }

        res.redirect("/dashboard")
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

export default productRouter
