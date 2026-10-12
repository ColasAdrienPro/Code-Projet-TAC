import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD,
        }
        : undefined,
})

export const sendPasswordResetEmail = async ({ to, resetUrl }) => {
    await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject: "Reinitialisation de votre mot de passe",
        text: [
            "Vous avez demande a reinitialiser votre mot de passe TonAvisCompte.",
            "",
            `Cliquez sur ce lien pour choisir un nouveau mot de passe : ${resetUrl}`,
            "",
            "Ce lien expire dans 1 heure. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.",
        ].join("\n"),
        html: `
            <p>Vous avez demande a reinitialiser votre mot de passe TonAvisCompte.</p>
            <p><a href="${resetUrl}">Choisir un nouveau mot de passe</a></p>
            <p>Ce lien expire dans 1 heure. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>
        `,
    })
}
