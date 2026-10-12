import { Router } from "express"
import { prisma } from "../db.js"
import { authguard } from "../middleware/authguard.js"
import { productSchema } from "../validations/productValidation.js"

const productRouter = Router()

const formatInputDate = (date) => {
    if (!date) {
        return ""
    }

    return date.toISOString().slice(0, 10)
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

const getProductId = (req) => {
    const productId = Number(req.params.id)

    return Number.isInteger(productId) && productId > 0 ? productId : null
}

const getCategories = () => {
    return prisma.category.findMany({
        orderBy: {
            name: "asc",
        },
    })
}

const renderProductForm = async (res, options) => {
    const categories = await getCategories()

    res.render("pages/product-form.twig", {
        ...options,
        categories,
    })
}

productRouter.get("/products/new", authguard, async (req, res) => {
    await renderProductForm(res, {
        title: "Ajouter un produit",
        action: "/products",
        submitLabel: "Ajouter",
        values: {},
    })
})

productRouter.get("/products/latest", async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : ""
    const categoryId = Number(req.query.category)
    const selectedCategoryId = Number.isInteger(categoryId) && categoryId > 0 ? categoryId : null
    const productWhere = {
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

productRouter.get("/products/:id", async (req, res) => {
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

        const notes = product.opinions.map((opinion) => opinion.note)
        const averageNote = notes.length
            ? (notes.reduce((total, note) => total + note, 0) / notes.length).toFixed(1)
            : null

        res.render("pages/product-detail.twig", {
            product: {
                ...product,
                releaseDateLabel: formatDate(product.release_date),
                averageNote,
            },
            user: req.user,
        })
    } catch (error) {
        console.log(error)
        res.redirect("/dashboard")
    }
})

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
            },
        })

        res.redirect("/dashboard")
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

        if (product && product.user_id === req.user.id) {
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
