import { z } from "zod"

// Valide les champs d'un avis avant son enregistrement.
export const opinionSchema = z.object({
    note: z.coerce.number({
        error: "La note est obligatoire.",
    })
        .int("La note doit etre un nombre entier.")
        .min(1, "La note minimale est 1.")
        .max(5, "La note maximale est 5."),
    title: z.string()
        .trim()
        .min(1, "Le titre est obligatoire.")
        .max(255, "Le titre ne peut pas depasser 255 caracteres."),
    text: z.string()
        .trim()
        .min(1, "Le contenu de l'avis est obligatoire."),
})
