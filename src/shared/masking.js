export function maskPhone(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value).replace(/[^\d+]/g, "");
  const match = normalized.match(/^(\+\d{4})\d+(\d{4})$/);
  if (!match) {
    return "***";
  }

  return `${match[1]}***${match[2]}`;
}

export function maskEmail(value) {
  if (!value) {
    return null;
  }

  const [localPart, domain] = String(value).split("@");
  if (!localPart || !domain) {
    return "***";
  }

  return `${localPart.slice(0, 2)}***@${domain}`;
}

export function maskBarcode(value) {
  if (!value) {
    return null;
  }

  const text = String(value).replace(/\s+/g, "");
  if (text.length <= 6) {
    return `${text.slice(0, 3)}***`;
  }

  return `${text.slice(0, 6)}******`;
}

export function maskIdentity(type, value) {
  if (type === "phone") {
    return maskPhone(value);
  }

  if (type === "email") {
    return maskEmail(value);
  }

  if (type === "wallet_card" || type === "wallet_barcode") {
    return maskBarcode(value);
  }

  return "***";
}
