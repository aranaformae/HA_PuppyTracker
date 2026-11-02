import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, detail, finalPaymentAmount, formattedAmount, formattedDate, optionLabel, selectField, text } from "./puppy-tracker-owner-common.js";
import { escapeHtml } from "./puppy-tracker-card-common.js";

/** Owner finance operations; canonical state and lifecycle belong to the card. */

export function paymentHistory(card, owner, litterId) {
    const entries = owner.payment_events || [];
    const cents = entries.filter(entry => !entry.voided_at).reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100), 0);
    const draft = card._paymentDraft?.ownerId === owner.id && card._paymentDraft.litterId === litterId ? card._paymentDraft : null;
    const options = (labels, selected) => Object.entries(labels).map(([key]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${escapeHtml(optionLabel(card, key, labels, key))}</option>`).join("");
    const form = draft ? `<form class="payment-event-form" data-payment-form="${escapeHtml(owner.id)}" data-payment-litter="${escapeHtml(litterId)}">
      <label>${escapeHtml(text(card, "paymentAmountReceived"))}<input name="amount" type="text" inputmode="decimal" required value="${escapeHtml(draft.amount)}"></label>
      <label>${escapeHtml(text(card, "paymentReceivedDate"))}<input name="date" type="date" required value="${escapeHtml(draft.date)}"></label>
      <label>${escapeHtml(text(card, "paymentKind"))}<select name="kind">${options(PAYMENT_KIND_LABELS, draft.kind)}</select></label>
      <label>${escapeHtml(text(card, "paymentMethod"))}<select name="method">${options(PAYMENT_METHOD_LABELS, draft.method)}</select></label>
      <label>${escapeHtml(text(card, "paymentReference"))}<input name="reference" maxlength="120" value="${escapeHtml(draft.reference)}"></label>
      <label>${escapeHtml(text(card, "paymentNote"))}<input name="note" maxlength="240" value="${escapeHtml(draft.note)}"></label>
      <div class="actions"><button type="button" class="secondary" data-cancel-payment>${escapeHtml(text(card, "cancel"))}</button><button type="submit" class="primary">${escapeHtml(text(card, "savePayment"))}</button></div>
    </form>` : `<button type="button" class="secondary" data-add-payment="${escapeHtml(owner.id)}" data-payment-litter="${escapeHtml(litterId)}">${escapeHtml(text(card, "addPayment"))}</button>`;
    return `<div class="payment-history wide"><p>${escapeHtml(text(card, "paymentHistoryHint"))}</p>
      <strong>${escapeHtml(text(card, "recordedTotal"))}: ${escapeHtml(formattedAmount(card, (cents / 100).toFixed(2)))}</strong>
      ${entries.length ? `<ul>${[...entries].reverse().map(entry => `<li class="${entry.voided_at ? "voided" : ""}"><div><strong>${escapeHtml(formattedAmount(card, entry.amount))}</strong> · ${escapeHtml(formattedDate(card, entry.date))} · ${escapeHtml(optionLabel(card, entry.kind, PAYMENT_KIND_LABELS, entry.kind))} · ${escapeHtml(optionLabel(card, entry.method, PAYMENT_METHOD_LABELS, "none"))}${entry.reference ? ` · ${escapeHtml(entry.reference)}` : ""}${entry.note ? `<small>${escapeHtml(entry.note)}</small>` : ""}${entry.voided_at ? `<small>${escapeHtml(text(card, "voidedPayment"))}: ${escapeHtml(entry.void_reason)}</small>` : ""}</div>${entry.voided_at ? "" : `<button type="button" class="secondary" data-void-payment="${escapeHtml(entry.id)}" data-payment-owner="${escapeHtml(owner.id)}" data-payment-litter="${escapeHtml(litterId)}">${escapeHtml(text(card, "voidPayment"))}</button>`}</li>`).join("")}</ul>` : `<p>${escapeHtml(text(card, "noPaymentEvents"))}</p>`}
      ${form}</div>`;
}

export function updateFinalPaymentPreview(card) {
    const form = card.querySelector(".owner-editor form");
    const output = card.querySelector("#final-payment-amount");
    if (!form || !output) return;
    output.textContent = finalPaymentAmount(Object.fromEntries(new FormData(form).entries())) || "—";
}

export function syncPaymentStatus(card, markPaid = false) {
    const form = card.querySelector(".owner-editor form");
    if (!form) return;
    const paid = form.elements.payment_status.value === "full";
    const balance = form.elements.payment_balance;
    const date = form.elements.payment_date;
    if (paid && markPaid && !balance.readOnly) card._paymentBeforeFull = { balance: balance.value, date: date.value };
    if (paid) {
      balance.value = "0";
      if (markPaid && !date.value) {
        const now = new Date();
        date.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        if (card._paymentBeforeFull) card._paymentBeforeFull.automaticDate = date.value;
      }
    } else if (card._paymentBeforeFull) {
      balance.value = card._paymentBeforeFull.balance;
      if (date.value === card._paymentBeforeFull.automaticDate) date.value = card._paymentBeforeFull.date;
      card._paymentBeforeFull = null;
    }
    balance.readOnly = paid;
    card._formState.capture();
    card._updateOwnerDraftStatus();
}

export function financialDetails(card, owner) {
  return `
      ${detail(card, text(card, "paymentStatus"), optionLabel(card, owner.payment_status, PAYMENT_STATUS_LABELS, "none"))}
      ${detail(card, text(card, "paymentAmount"), owner.payment_amount ?? "—")}
      ${detail(card, text(card, "registrationFeeAmount"), owner.registration_fee_amount ?? "—")}
      ${detail(card, text(card, "depositAmount"), owner.deposit_amount ?? "—")}
      ${detail(card, text(card, "depositDate"), formattedDate(card, owner.deposit_date))}
      ${detail(card, text(card, "finalPaymentAmount"), finalPaymentAmount(owner) || "—")}
      ${detail(card, text(card, "paymentMethod"), optionLabel(card, owner.payment_method, PAYMENT_METHOD_LABELS, "none"))}
      ${detail(card, text(card, "paymentBalance"), owner.payment_balance ?? "—")}
      ${detail(card, text(card, "paymentDate"), formattedDate(card, owner.payment_date))}
      ${owner.payment_status !== "full" ? `<div class="wide"><button type="button" class="secondary" data-mark-paid="${escapeHtml(owner.id)}" ${card._busy ? "disabled" : ""}><ha-icon icon="mdi:cash-check"></ha-icon>${escapeHtml(text(card, "markPaidInFull"))}</button></div>` : ""}`;
}

export function financialFields(card, owner) {
  return `
      ${selectField(card, "payment_status", text(card, "paymentStatus"), PAYMENT_STATUS_LABELS, owner.payment_status || "none")}
      <label><span>${escapeHtml(text(card, "paymentAmount"))}</span><input name="payment_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.payment_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(card, "registrationFeeAmount"))}</span><input name="registration_fee_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.registration_fee_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(card, "depositAmount"))}</span><input name="deposit_amount" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.deposit_amount ?? "")}"></label>
      <label><span>${escapeHtml(text(card, "depositDate"))}</span><input name="deposit_date" type="date" value="${escapeHtml(owner.deposit_date || "")}"></label>
      <label class="calculated"><span>${escapeHtml(text(card, "finalPaymentAmount"))}</span><output id="final-payment-amount">${escapeHtml(finalPaymentAmount(owner) || "—")}</output></label>
      <label><span>${escapeHtml(text(card, "paymentBalance"))}</span><input name="payment_balance" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(owner.payment_balance ?? "")}"></label>
      ${selectField(card, "payment_method", text(card, "paymentMethod"), PAYMENT_METHOD_LABELS, owner.payment_method || "none")}
      <label><span>${escapeHtml(text(card, "paymentDate"))}</span><input name="payment_date" type="date" value="${escapeHtml(owner.payment_date || "")}"></label>`;
}
