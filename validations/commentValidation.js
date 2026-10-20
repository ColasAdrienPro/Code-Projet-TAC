import { z } from "zod"

// Valide les champs d'un commentaire avant son enregistrement.
export const commentSchema = z.object({
    title: z.string()
        .trim()
        .min(1, "Le titre du commentaire est obligatoire.")
        .max(255, "Le titre ne peut pas depasser 255 caracteres."),
    text: z.string()
        .trim()
        .min(1, "Le contenu du commentaire est obligatoire."),
})
