import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format } from "date-fns";
import * as QRCode from "qrcode";
import ArabicReshaper from "arabic-reshaper";

const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic&text=";
const FALLBACK_FONT_URLS = [
  "https://fonts.gstatic.com/s/notonaskharabic/v34/NotoNaskhArabic-Regular.ttf",
  "https://fonts.gstatic.com/s/notonaskharabic/v33/NotoNaskhArabic-Regular.ttf",
];
let arabicFontReady = false;
let arabicFontPromise: Promise<void> | null = null;

function containsArabic(text: string): boolean {
  return ARABIC_REGEX.test(text);
}

function reshapeArabic(text: string): string {
  if (!containsArabic(text)) return text;
  try {
    const reshaped = ArabicReshaper.convertArabic(text);
    return reshaped.split("").reverse().join("");
  } catch {
    return text;
  }
}

async function resolveGoogleFontUrl(): Promise<string | null> {
  try {
    const chars = encodeURIComponent("ابتثجحخدذرزسشصضطظعغفقكلمنهوي ةىئآأؤلا");
    const resp = await fetch(GOOGLE_FONTS_CSS + chars, { mode: "cors" });
    if (resp.ok) {
      const css = await resp.text();
      const match = css.match(/url\(([^)]+)\)/);
      if (match) return match[1].replace(/['"]/g, "");
    }
  } catch {}
  return null;
}

async function ensureArabicFont(doc: jsPDF): Promise<void> {
  if (arabicFontReady) return;
  if (arabicFontPromise) return arabicFontPromise;
  arabicFontPromise = loadArabicFont(doc);
  await arabicFontPromise;
}

async function loadArabicFont(doc: jsPDF): Promise<void> {
  const resolvedUrl = await resolveGoogleFontUrl();
  const urls = resolvedUrl ? [resolvedUrl, ...FALLBACK_FONT_URLS] : FALLBACK_FONT_URLS;
  for (const url of urls) {
    try {
      const resp = await fetch(url, { mode: "cors" });
      if (!resp.ok) continue;
      const buffer = await resp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      doc.addFileToVFS("NotoNaskhArabic-Regular.ttf", btoa(binary));
      doc.addFont("NotoNaskhArabic-Regular.ttf", "NotoNaskhArabic", "normal");
      arabicFontReady = true;
      return;
    } catch {}
  }
  console.warn("Failed to load Arabic font - Arabic text may not render");
}

function writeText(doc: jsPDF, text: string, x: number, y: number, options?: any) {
  if (containsArabic(text) && arabicFontReady) {
    doc.setFont("NotoNaskhArabic", "normal");
    doc.text(reshapeArabic(text), x, y, options);
  } else {
    doc.setFont("helvetica", options?.fontStyle || "normal");
    doc.text(text, x, y, options);
  }
}

function getAge(patient: any): number | null {
  if (patient.birth_date) {
    return new Date().getFullYear() - new Date(patient.birth_date).getFullYear();
  }
  return patient.age ?? null;
}

export async function generatePrescriptionPDF(patient: any, consultation: any, medications: any[], doctor: any, prescriptionCode?: string) {
  const storedTemplate = typeof localStorage !== "undefined" ? localStorage.getItem("medicab_prescription_template") : null;
  const template = storedTemplate ? JSON.parse(storedTemplate) : {};
  const pageFormat = template.format === "a5" ? "a5" : "a4";
  const orientation = template.orientation === "landscape" ? "landscape" : "portrait";
  const doc = new jsPDF({ format: pageFormat, orientation });
  await ensureArabicFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginTop = Number(template.marginTop || 18);
  const marginLeft = Number(template.marginLeft || 20);
  const marginRight = Number(template.marginRight || 20);
  const printTop = Number(template.printTop || 90);
  const printBottom = Number(template.printBottom || 35);
  
  // Header
  const clinicName = template.header || doctor?.clinic_name || "VOTRE CABINET MEDICAL";
  const doctorName = doctor?.full_name ? `DR. ${doctor.full_name}` : "DR. MEDECIN";
  const specialty = doctor?.specialty || "Médecin";
  const address = doctor?.address ? `${doctor.address}${doctor.city ? ', ' + doctor.city : ''}` : "";
  const phone = doctor?.phone ? `Tél: ${doctor.phone}` : "";
  const authNum = doctor?.register_number ? `Réf: ${doctor.register_number}` : "";

  if (template.logo) {
    try { doc.addImage(template.logo, 'PNG', marginLeft, marginTop - 5, 24, 24); } catch {}
  }

  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.setFont("helvetica", "bold");
  doc.text(clinicName.toUpperCase(), pageWidth / 2, marginTop, { align: "center" });
  
  doc.setFontSize(12);
  doc.text(doctorName.toUpperCase(), pageWidth / 2, marginTop + 7, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "italic");
  doc.text(specialty, pageWidth / 2, marginTop + 12, { align: "center" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const contactInfo = [address, phone, authNum].filter(Boolean).join(" - ");
  doc.text(contactInfo, pageWidth / 2, marginTop + 17, { align: "center" });
  
  doc.setLineWidth(0.5);
  doc.line(20, 38, 190, 38)
  
  // Date and prescription code
  doc.setFontSize(12);
  doc.text(`Le: ${format(new Date(), "dd/MM/yyyy")}`, pageWidth - marginRight - 40, marginTop + 30);
  if (prescriptionCode) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`N°: ${prescriptionCode}`, pageWidth - marginRight - 40, marginTop + 36);
    doc.setFont("helvetica", "normal");
  }

  // QR Code
  if (prescriptionCode) {
    try {
      const qrDataUrl = await QRCode.toDataURL(prescriptionCode, { margin: 1, width: 100 });
      doc.addImage(qrDataUrl, 'PNG', marginLeft, marginTop + 22, 25, 25);
    } catch (err) {
      console.error("Error generating QR code:", err);
    }
  }
  
  // Patient Info
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT:", marginLeft + 30, marginTop + 37);
  writeText(doc, `${patient.last_name} ${patient.first_name}`, marginLeft + 52, marginTop + 37, { fontStyle: "normal" });
  
  const age = getAge(patient);
  if (age !== null) {
    doc.setFont("helvetica", "normal");
    doc.text(`Âge: ${age} ans`, marginLeft + 30, marginTop + 44);
  }
  
  if (patient.nin) {
    doc.setFontSize(10);
    doc.text(`NIN: ${patient.nin}`, marginLeft + 30, marginTop + 50);
    doc.setFontSize(12);
  }
  
  // Prescription Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ORDONNANCE", pageWidth / 2, printTop - 15, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${medications.length} médicament${medications.length > 1 ? 's' : ''} prescrit${medications.length > 1 ? 's' : ''}`, pageWidth / 2, printTop - 5, { align: "center" });
  
  // Medications List
  let y = printTop;
  doc.setFontSize(12);
  medications.forEach((med, index) => {
    const medLabel = `${index + 1}. ${med.name} ${med.form ? '(' + med.form + ')' : ''} ${med.dosage || ""}`;
    writeText(doc, medLabel, marginLeft + 5, y, { fontStyle: "bold" });
    y += 7;
    doc.setFont("helvetica", "italic");
    doc.text(`${med.duration ? med.duration + ' - ' : ''}${med.instructions || ""}`, marginLeft + 10, y);
    y += 10;
    
    if (y > pageHeight - printBottom) {
      doc.addPage();
      y = marginTop;
    }
  });
  
  // Footer
  doc.setLineWidth(0.5);
  doc.line(marginLeft, pageHeight - printBottom + 5, pageWidth - marginRight, pageHeight - printBottom + 5);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(template.signature || "Cachet et signature:", pageWidth - marginRight - 50, pageHeight - printBottom + 15);
  if (template.footer) doc.text(template.footer, pageWidth / 2, pageHeight - 10, { align: "center" });
  
  const safeName = (patient.last_name || "patient").replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`ordonnance_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

export async function generateDispenseReceiptPDF(patient: any, medications: any[], pharmacist: any, doctorName: string, prescriptionCode?: string) {
  const doc = new jsPDF();
  await ensureArabicFont(doc);
  
  // Header
  const pharmacyName = pharmacist?.clinic_name || "PHARMACIE";
  const pharmName = pharmacist?.full_name ? `PH. ${pharmacist.full_name}` : "PHARMACIEN";
  const address = pharmacist?.address ? `${pharmacist.address}${pharmacist.city ? ', ' + pharmacist.city : ''}` : "";
  const phone = pharmacist?.phone ? `Tél: ${pharmacist.phone}` : "";

  doc.setFontSize(16);
  doc.setTextColor(40);
  doc.setFont("helvetica", "bold");
  doc.text(pharmacyName.toUpperCase(), 105, 18, { align: "center" });
  
  doc.setFontSize(11);
  doc.text("BON DE LIVRAISON MÉDICAMENTS", 105, 25, { align: "center" });
  
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const contactInfo = [address, phone].filter(Boolean).join(" - ");
  doc.text(contactInfo, 105, 30, { align: "center" });
  
  doc.setLineWidth(0.5);
  doc.line(20, 35, 190, 35);

  // Patient & Doctor Info
  doc.setFontSize(10);
  writeText(doc, `Patient: ${patient.last_name} ${patient.first_name}`, 20, 45);
  doc.text(`Pratiqué par: ${doctorName || "Médecin"}`, 20, 52);
  doc.text(`Date: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 190, 45, { align: "right" });
  if (prescriptionCode) {
    doc.text(`Réf Ordonnance: ${prescriptionCode}`, 190, 52, { align: "right" });
  }

  // Table Header
  doc.setFillColor(245, 247, 250);
  doc.rect(20, 60, 170, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Médicament", 25, 65);
  doc.text("Dosage", 100, 65);
  doc.text("Prix (DA)", 175, 65, { align: "right" });

  // Table Content
  doc.setFont("helvetica", "normal");
  let y = 75;
  let total = 0;
  medications.forEach((med) => {
    doc.text(med.name || med.medication || "", 25, y);
    doc.text(med.dosage || "", 100, y);
    const price = parseFloat(med.price) || 0;
    doc.text(price > 0 ? price.toFixed(2) : "-", 175, y, { align: "right" });
    total += price;
    y += 10;
  });

  doc.setLineWidth(0.2);
  doc.line(20, y - 5, 190, y - 5);
  
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL À PAYER:", 140, y + 5);
  doc.text(`${total.toFixed(2)} DA`, 175, y + 5, { align: "right" });

  // Footer / Signature
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text("Ce document justifie la livraison des médicaments mentionnés ci-dessus.", 105, 280, { align: "center" });
  doc.text(`Délivré par: ${pharmName}`, 105, 285, { align: "center" });

  doc.save(`recu-livraison-${prescriptionCode || 'temp'}.pdf`);
}

export async function generateInvoicePDF(patient: any, fee: number, doctor: any) {
  const doc = new jsPDF();
  await ensureArabicFont(doc);
  
  // Header
  const clinicName = doctor?.clinic_name || "CLINIQUE MÉDICALE";
  const docName = doctor?.full_name ? `DR. ${doctor.full_name}` : "MÉDECIN";
  const address = doctor?.address ? `${doctor.address}${doctor.city ? ', ' + doctor.city : ''}` : "";
  const phone = doctor?.phone ? `Tél: ${doctor.phone}` : "";

  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.setFont("helvetica", "bold");
  doc.text(clinicName.toUpperCase(), 105, 20, { align: "center" });
  
  doc.setFontSize(14);
  doc.text("FACTURE D'HONORAIRES", 105, 30, { align: "center" });
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${address} ${phone}`, 105, 36, { align: "center" });
  
  doc.setLineWidth(0.5);
  doc.line(20, 42, 190, 42);

  // Billing Info
  doc.setFontSize(11);
  writeText(doc, `Patient: ${patient.last_name} ${patient.first_name}`, 20, 55);
  doc.text(`Date: ${format(new Date(), "dd/MM/yyyy")}`, 190, 55, { align: "right" });
  
  // Invoice Details
  doc.setFillColor(245, 247, 250);
  doc.rect(20, 65, 170, 10, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Description", 25, 72);
  doc.text("Montant (DA)", 175, 72, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.text("Consultation Médicale / Honoraires", 25, 85);
  doc.text(`${fee.toFixed(2)} DA`, 175, 85, { align: "right" });

  doc.setLineWidth(0.2);
  doc.line(20, 95, 190, 95);
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", 140, 105);
  doc.text(`${fee.toFixed(2)} DA`, 175, 105, { align: "right" });

  // Footer
  doc.setFontSize(10);
  doc.text("Signature & Cachet", 150, 140);
  
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text("Merci pour votre confiance.", 105, 280, { align: "center" });

  doc.save(`facture_${patient.last_name}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

export function generateReportPDF(patient: any, report: any) {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(40);
  doc.text("DR. MEDI CABINET", 105, 20, { align: "center" });
  
  doc.setFontSize(10);
  doc.text("Médecine Générale & Spécialisée", 105, 28, { align: "center" });
  doc.text("Téléphone: +213 (0) XX XX XX XX - Email: contact@medicabinet.dz", 105, 34, { align: "center" });
  
  doc.setLineWidth(0.5);
  doc.line(20, 38, 190, 38)
  
  // Date and Place
  doc.setFontSize(12);
  doc.text(`Alger, le: ${format(new Date(report.date), "dd/MM/yyyy")}`, 150, 48);
  
  // Report Title
  const titles: Record<string, string> = {
    certificate: "CERTIFICAT MÉDICAL",
    sick_leave: "AVIS D'ARRÊT DE TRAVAIL",
    orientation: "LETTRE D'ORIENTATION",
    report: "COMPTE-RENDU MÉDICAL"
  };
  
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(titles[report.type] || "DOCUMENT MÉDICAL", 105, 70, { align: "center" });
  
  // Content
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  
  const splitContent = doc.splitTextToSize(report.content, 170);
  doc.text(splitContent, 20, 90);
  
  // Footer
  const pageHeight = doc.internal.pageSize.height;
  doc.setLineWidth(0.5);
  doc.line(20, pageHeight - 40, 190, pageHeight - 40);
  
  doc.setFontSize(10);
  doc.text("Cachet et signature:", 140, pageHeight - 30);
  
  const safeName = (patient.last_name || "patient").replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`${report.type}_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

export async function generateExamReportPDF(patient: any, exam: any, doctor: any) {
  const doc = new jsPDF();
  await ensureArabicFont(doc);

  doc.setFontSize(18);
  doc.setTextColor(40);
  doc.setFont("helvetica", "bold");
  doc.text("RAPPORT D'EXAMEN PARACLINIQUE", 105, 20, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const doctorName = doctor?.full_name ? `Dr. ${doctor.full_name}` : "Médecin";
  doc.text(`Prescrit par: ${doctorName}`, 105, 28, { align: "center" });

  doc.setLineWidth(0.5);
  doc.line(20, 34, 190, 34);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  writeText(doc, `Patient: ${patient.last_name || ''} ${patient.first_name || ''}`, 20, 46, { fontStyle: "bold" });
  doc.setFont("helvetica", "normal");
  const age = getAge(patient);
  if (age !== null) {
    doc.text(`Âge: ${age} ans`, 20, 54);
  }
  doc.text(`Date: ${format(new Date(exam.date), "dd/MM/yyyy")}`, 190, 46, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.text(`Examen: ${exam.sub_type || ''}`, 20, 64);
  doc.setFont("helvetica", "normal");
  doc.text(`Type: ${exam.type === 'analysis' ? 'Analyse Médicale' : 'Imagerie Médicale'}`, 20, 72);

  let y = 88;
  if (exam.provider) {
    doc.setFont("helvetica", "bold");
    doc.text("Laboratoire / Centre:", 20, y);
    doc.setFont("helvetica", "normal");
    doc.text(exam.provider, 65, y);
    y += 10;
  }

  if (exam.indication) {
    doc.setFont("helvetica", "bold");
    doc.text("Indication Médicale:", 20, y);
    y += 6;
    doc.setFont("helvetica", "italic");
    const splitIndication = doc.splitTextToSize(exam.indication, 170);
    doc.text(splitIndication, 20, y);
    y += splitIndication.length * 5 + 10;
  }

  if (exam.result) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.text("Résultats / Rapport:", 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    const splitResult = doc.splitTextToSize(exam.result, 170);
    doc.text(splitResult, 20, y);
    y += splitResult.length * 5 + 10;
  }

  if (exam.notes) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.text("Notes complémentaires:", 20, y);
    y += 6;
    doc.setFont("helvetica", "italic");
    const splitNotes = doc.splitTextToSize(exam.notes, 170);
    doc.text(splitNotes, 20, y);
  }

  const pageHeight = doc.internal.pageSize.height;
  doc.setLineWidth(0.5);
  doc.line(20, pageHeight - 40, 190, pageHeight - 40);
  doc.setFontSize(10);
  doc.text("Cachet et signature:", 140, pageHeight - 30);

  const safeName = (patient.last_name || "patient").replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`examen_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`);
}
