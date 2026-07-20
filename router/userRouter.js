import { Router } from "express"
import { compare, hash } from "bcrypt"
import { prisma } from "../db.js"
import { authguard } from "../middleware/authguard.js"
import { loginUserSchema, registerUserSchema } from "../validations/userValidation.js"

const userRouter = Router()
const salt = Number(process.env.SALT)

userRouter.get("/register", (req, res) => {
    res.render("pages/register.twig")
})

userRouter.post("/register", async (req,res)=>{
    const validation = registerUserSchema.safeParse(req.body)
    const values = {
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        email: req.body.email,
    }

    if (!validation.success) {
        return res.render("pages/register.twig", {
            error: validation.error.issues[0].message,
            values,
        })
    }

    const { firstname, lastname, email, password } = validation.data

    try {
        const existingUser = await prisma.user.findUnique({
            where: { email },
        })

        if (existingUser) {
            return res.render("pages/register.twig", {
                error: "Un compte existe deja avec cet email.",
                values,
            })
        }

        const hashedPassword = await hash(password, salt)

        await prisma.user.create({
            data: {
                firstname,
                lastname,
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

userRouter.get("/dashboard", authguard, (req, res) => {
    res.render("pages/dashboard.twig", {
        user: req.user,
    })
})

userRouter.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login")
    })
})

export default userRouter
