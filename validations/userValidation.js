import { z } from "zod"

const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/
const usernameRegex = /^[A-Za-z0-9_-]{3,30}$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/

// Valide les donnees du formulaire d'inscription.
export const registerUserSchema = z.object({
    firstname: z.string()
        .trim()
        .min(1, "Le prenom est obligatoire.")
        .regex(nameRegex, "Le prenom ne doit contenir que des lettres, espaces, apostrophes ou tirets."),
    lastname: z.string()
        .trim()
        .min(1, "Le nom est obligatoire.")
        .regex(nameRegex, "Le nom ne doit contenir que des lettres, espaces, apostrophes ou tirets."),
    username: z.string()
        .trim()
        .regex(usernameRegex, "Le pseudo doit contenir entre 3 et 30 caracteres, avec lettres, chiffres, tirets ou underscores."),
    email: z.string()
        .trim()
        .min(1, "L'email est obligatoire.")
        .regex(emailRegex, "L'email n'est pas valide."),
    password: z.string()
        .regex(passwordRegex, "Le mot de passe doit contenir au moins 8 caracteres, une majuscule, une minuscule, un chiffre et un caractere special."),
    confirmPassword: z.string().min(1, "La confirmation du mot de passe est obligatoire."),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
})

// Valide les identifiants envoyes lors de la connexion.
export const loginUserSchema = z.object({
    email: z.string()
        .trim()
        .min(1, "L'email est obligatoire.")
        .regex(emailRegex, "L'email n'est pas valide."),
    password: z.string()
        .min(1, "Le mot de passe est obligatoire."),
})

// Valide l'email utilise pour demander une reinitialisation de mot de passe.
export const forgotPasswordSchema = z.object({
    email: z.string()
        .trim()
        .min(1, "L'email est obligatoire.")
        .regex(emailRegex, "L'email n'est pas valide."),
})

// Valide le nouveau mot de passe et sa confirmation.
export const resetPasswordSchema = z.object({
    password: z.string()
        .regex(passwordRegex, "Le mot de passe doit contenir au moins 8 caracteres, une majuscule, une minuscule, un chiffre et un caractere special."),
    confirmPassword: z.string().min(1, "La confirmation du mot de passe est obligatoire."),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"],
})

// Valide l'email et le code saisis pour verifier un compte.
export const verifyAccountSchema = z.object({
    email: z.string()
        .trim()
        .min(1, "L'email est obligatoire.")
        .regex(emailRegex, "L'email n'est pas valide."),
    code: z.string()
        .trim()
        .regex(/^\d{6}$/, "Le code doit contenir exactement 6 chiffres."),
})

// Valide l'email avant de renvoyer un code de verification.
export const resendVerificationCodeSchema = z.object({
    email: z.string()
        .trim()
        .min(1, "L'email est obligatoire.")
        .regex(emailRegex, "L'email n'est pas valide."),
})
