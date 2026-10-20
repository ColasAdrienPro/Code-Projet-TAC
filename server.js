import express from "express"
import session from "express-session"
import "dotenv/config"
import commentRouter from "./router/commentRouter.js"
import opinionRouter from "./router/opinionRouter.js"
import productRouter from "./router/productRouter.js"
import userRouter from "./router/userRouter.js"

const app = express()

app.set("view engine", "twig")
app.set("views", "views")

app.use(express.static("public"))
app.use(express.urlencoded({ extended: true }))
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24,
    },
}))

app.use(userRouter)
app.use(productRouter)
app.use(opinionRouter)
app.use(commentRouter)

// Demarre le serveur Express et affiche une erreur si le port ne repond pas.
app.listen(process.env.PORT, (err)=>{
    if (err) {
        console.log(err);
    }else {
        console.log(`connectée sur le Port ${process.env.PORT}`);
    }
})
