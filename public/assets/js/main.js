const likedClasses = ["border-[#00652c]", "bg-[#e7f8ec]", "text-[#00652c]", "hover:bg-[#d3ffd5]"]
const unlikedClasses = ["border-[#becabc]", "bg-white", "text-[#00652c]", "hover:border-[#00652c]", "hover:bg-[#ecfdf0]"]

const confirmModal = document.querySelector("[data-confirm-modal]")
const confirmModalPanel = confirmModal?.querySelector(".confirm-modal__panel")
const confirmModalMessage = confirmModal?.querySelector("[data-confirm-modal-message]")
const confirmModalSubmit = confirmModal?.querySelector("[data-confirm-submit]")
const confirmModalCancelButtons = confirmModal?.querySelectorAll("[data-confirm-cancel]")
let pendingConfirmForm = null
let pendingConfirmSubmitter = null
let previousFocusedElement = null

const closeConfirmModal = () => {
    if (!confirmModal) {
        return
    }

    confirmModal.hidden = true
    document.body.classList.remove("confirm-modal-open")
    pendingConfirmForm = null
    pendingConfirmSubmitter = null
    previousFocusedElement?.focus()
    previousFocusedElement = null
}

const openConfirmModal = (form, submitter) => {
    if (!confirmModal || !confirmModalMessage) {
        form.dataset.confirmed = "true"
        if (form.requestSubmit) {
            submitter ? form.requestSubmit(submitter) : form.requestSubmit()
        } else {
            form.submit()
        }
        return
    }

    pendingConfirmForm = form
    pendingConfirmSubmitter = submitter
    previousFocusedElement = document.activeElement
    confirmModalMessage.textContent = form.dataset.confirmMessage || "Voulez-vous continuer ?"
    confirmModal.hidden = false
    document.body.classList.add("confirm-modal-open")
    confirmModalPanel?.focus()
}

document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-confirm-message]")

    if (!form) {
        return
    }

    if (form.dataset.confirmed === "true") {
        delete form.dataset.confirmed
        return
    }

    event.preventDefault()
    openConfirmModal(form, event.submitter)
})

confirmModalSubmit?.addEventListener("click", () => {
    if (!pendingConfirmForm) {
        closeConfirmModal()
        return
    }

    const form = pendingConfirmForm
    const submitter = pendingConfirmSubmitter
    form.dataset.confirmed = "true"
    closeConfirmModal()

    if (form.requestSubmit) {
        submitter ? form.requestSubmit(submitter) : form.requestSubmit()
    } else {
        form.submit()
    }
})

confirmModalCancelButtons?.forEach((button) => {
    button.addEventListener("click", closeConfirmModal)
})

document.addEventListener("keydown", (event) => {
    if (!confirmModal || confirmModal.hidden || event.key !== "Escape") {
        return
    }

    closeConfirmModal()
})

// Met a jour l'apparence et le texte du bouton de like selon son etat.
const setButtonState = (form, liked) => {
    const button = form.querySelector("[data-like-button]")

    if (!button) {
        return
    }

    form.dataset.liked = liked ? "true" : "false"
    button.classList.remove(...likedClasses, ...unlikedClasses)
    button.classList.add(...(liked ? likedClasses : unlikedClasses))
    button.textContent = liked
        ? (form.action.includes("/comments/") ? "Retirer" : "Je n'aime plus")
        : "J'aime"
}

// Intercepte l'envoi des formulaires de like pour les traiter sans recharger la page.
document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-like-form]")

    if (!form) {
        return
    }

    event.preventDefault()

    const button = form.querySelector("[data-like-button]")
    const likeCount = form.parentElement?.querySelector("[data-like-count]")

    button?.setAttribute("disabled", "disabled")

    try {
        const response = await fetch(form.action, {
            method: "POST",
            headers: {
                Accept: "application/json",
            },
        })

        if (!response.ok) {
            form.submit()
            return
        }

        const result = await response.json()

        setButtonState(form, result.liked)

        if (likeCount) {
            likeCount.textContent = result.likeCount
        }
    } catch (error) {
        form.submit()
    } finally {
        button?.removeAttribute("disabled")
    }
})
