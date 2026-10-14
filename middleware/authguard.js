import { prisma } from "../db.js"

// Verifie que l'utilisateur est connecte avant de laisser passer la requete.
export const authguard = async (req, res, next) => {
    if (!req.session?.userId) {
        return res.redirect("/login")
    }

    const user = await prisma.user.findUnique({
        where: {
            id: Number(req.session.userId),
        },
    })

    if (!user) {
        return res.redirect("/login")
    }

    req.user = user
    next()
}
