import { z } from "zod"

const urlRegex = /^https?:\/\/.+/i

// Valide les informations necessaires a la creation ou modification d'un produit.
export const productSchema = z.object({
    title: z.string()
        .trim()
        .min(1, "Le titre est obligatoire.")
        .max(255, "Le titre ne peut pas depasser 255 caracteres."),
    category_id: z.coerce.number({
        error: "La categorie est obligatoire.",
    })
        .int("La categorie n'est pas valide.")
        .positive("La categorie est obligatoire."),
    image_url: z.string()
        .trim()
        .min(1, "L'URL de l'image est obligatoire.")
        .max(255, "L'URL de l'image ne peut pas depasser 255 caracteres.")
        .regex(urlRegex, "L'URL de l'image doit commencer par http:// ou https://."),
    release_date: z.string()
        .min(1, "La date de sortie est obligatoire.")
        .refine((value) => !Number.isNaN(new Date(value).getTime()), "La date de sortie n'est pas valide."),
    description: z.string()
        .trim()
        .min(1, "La description est obligatoire."),
})
