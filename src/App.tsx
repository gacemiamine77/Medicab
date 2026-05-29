/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, type ChangeEvent, type FormEvent } from "react";
import {
  Users,
  Calendar,
  FileText,
  Activity,
  Settings,
  Search,
  Plus,
  ChevronRight,
  Clock,
  TrendingUp,
  UserPlus,
  Stethoscope,
  ClipboardList,
  Printer,
  ChevronLeft,
  X,
  Languages,
  ArrowRight,
  Edit2,
  Microscope,
  Image as ImageIcon,
  FileSearch,
  FilePlus,
  History,
  UserCog,
  ShieldCheck,
  AlertCircle,
  Camera,
  Hash,
  Check,
  Bell,
  CheckCircle,
  Pill,
  CreditCard,
  PlusCircle,
  Share2,
  UserMinus,
  Moon,
  Sun,
  Type,
  CheckCircle2,
  BellRing,
  Trash2,
  MessageCircle,
  Mail,
  Phone,
  CalendarRange,
  FlaskConical,
  Upload,
  Download,
  ShieldAlert,
  AlertTriangle,
  Palette,
  Sparkles,
  Send
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { useTranslation } from "react-i18next";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import "./i18n";
import { api, type User, type Patient, type Appointment, type Consultation, type Medication, type MedicalExam, type MedicalReport, type MedicationLibrary, type DciInteraction, type Prescription, type SharePermission, type SimpleListItem, type ParaclinicalExam, type MedicationRestriction } from "./lib/api";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from "date-fns";
import { generatePrescriptionPDF, generateReportPDF, generateDispenseReceiptPDF, generateInvoicePDF, generateExamReportPDF } from "./lib/pdf";
import AdminPortal from "./components/AdminPortal";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Page = "dashboard" | "patients" | "appointments" | "patient-detail" | "new-patient" | "calendar" | "stats" | "medical-records" | "settings" | "contact" | "lab-dashboard" | "directory";

type Theme = 'light' | 'dark' | 'night' | 'medical' | 'duo' | 'moderne';
type FontSize = 'small' | 'medium' | 'large';

function SidebarItem({ icon: Icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-300 group",
        active
          ? "bg-blue-600 text-white shadow-xl shadow-blue-200"
          : "text-slate-500 hover:bg-blue-50 hover:text-blue-600"
      )}
    >
      <Icon size={20} className={cn("transition-transform duration-300", active ? "scale-110" : "group-hover:scale-110")} />
      <span className={cn("font-bold text-sm tracking-tight", active ? "opacity-100" : "opacity-80 group-hover:opacity-100")}>{label}</span>
    </button>
  );
}

function PharmacistDashboard({ onDispense, user }: { loading: boolean, onDispense: (id: number) => void, user: User }) {
  const [isSearchingNow, setIsSearchingNow] = useState(false);
  const [searchCode, setSearchCode] = useState("");
  const [foundPrescription, setFoundPrescription] = useState<Prescription | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selection and pricing state
  const [availableItems, setAvailableItems] = useState<any[]>([]);
  const [dispenseLoading, setDispenseLoading] = useState(false);

  const handleSearchByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCode) return;
    setIsSearchingNow(true);
    setSearchError(null);
    setFoundPrescription(null);
    try {
      const pr = await api.searchPrescription(searchCode);
      setFoundPrescription(pr);

      // Merge original prescription data with dispensed data to show what's delivered and what's not
      const originalMeds = pr.data as any[];
      const dispensedMeds = pr.dispensed_data || [];

      const mergedItems = originalMeds.map((med: any) => {
        const dispensed = dispensedMeds.find((d: any) => d.name === med.name && d.dosage === med.dosage);
        if (dispensed) {
          return { ...dispensed, delivered: true, available: true };
        }
        return { ...med, delivered: false, available: false, price: "" };
      });

      setAvailableItems(mergedItems);
    } catch (err: any) {
      setSearchError(err.message || "Ordonnance non trouvée");
    } finally {
      setIsSearchingNow(false);
    }
  };

  const toggleItem = (index: number) => {
    setAvailableItems(items => items.map((item, i) =>
      i === index ? { ...item, available: !item.available } : item
    ));
  };

  const setPrice = (index: number, price: string) => {
    setAvailableItems(items => items.map((item, i) =>
      i === index ? { ...item, price } : item
    ));
  };

  const currentTotal = availableItems
    .filter(i => i.available && !i.delivered)
    .reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

  const handleFinalDispense = async () => {
    if (!foundPrescription) return;
    setDispenseLoading(true);
    try {
      const deliveredItems = availableItems.filter(item => item.available);
      const newlyDelivered = availableItems.filter(item => item.available && !item.delivered);

      await api.dispensePrescription(foundPrescription.id, deliveredItems);

      // Print delivery receipt for newly delivered items
      if (newlyDelivered.length > 0) {
        await generateDispenseReceiptPDF(
          { first_name: foundPrescription.first_name, last_name: foundPrescription.last_name },
          newlyDelivered,
          user,
          foundPrescription.doctor_name || "",
          foundPrescription.prescription_code
        );
      } else {
        alert("Aucun nouveau médicament à livrer n'a été sélectionné.");
        setDispenseLoading(false);
        return;
      }

      setFoundPrescription(null);
      setSearchCode("");
      onDispense(foundPrescription.id);
      alert("Ordonnance traitée et bon de livraison généré.");
    } catch (err: any) {
      alert("Erreur: " + err.message);
    } finally {
      setDispenseLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 text-center">
        <div className="mb-8">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Search size={32} />
          </div>
          <h3 className="text-3xl font-black text-slate-800 tracking-tight">Espace Pharmacie</h3>
          <p className="text-slate-500 font-medium">Recherche d&apos;ordonnance par code barre ou QR code</p>
        </div>

        <form onSubmit={handleSearchByCode} className="max-w-xl mx-auto flex gap-3">
          <div className="relative flex-1">
            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Saisissez le code de l&apos;ordonnance..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold text-lg"
            />
          </div>
          <button
            type="submit"
            disabled={isSearchingNow}
            className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isSearchingNow ? "..." : "Rechercher"}
          </button>
        </form>

        {searchError && (
          <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold border border-red-100">
            {searchError}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {foundPrescription ? (
          <motion.div
            key={foundPrescription.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden"
          >
            <div className="p-8 border-b border-slate-50 flex justify-between items-start">
              <div>
                <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Détails de l&apos;Ordonnance</p>
                <h4 className="text-2xl font-black text-slate-800">{foundPrescription.first_name} {foundPrescription.last_name}</h4>
                <p className="text-slate-500 font-medium mt-1">Pratiqué par <span className="text-slate-800 font-bold">{foundPrescription.doctor_name}</span> le {format(new Date(foundPrescription.created_at), "dd/MM/yyyy")}</p>
              </div>
              <div className="text-right">
                <span className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest",
                  foundPrescription.status === 'pending' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                )}>
                  {foundPrescription.status === 'pending' ? 'En attente' : 'Délivrée'}
                </span>
                <p className="text-[10px] font-black text-slate-400 mt-2">CODE: {foundPrescription.prescription_code}</p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <h5 className="text-sm font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <Pill size={18} className="text-blue-600" />
                Médicaments Prescrits
              </h5>

              <div className="space-y-3">
                {availableItems.map((item, index) => (
                  <div key={index} className={cn(
                    "p-4 rounded-2xl border transition-all flex items-center justify-between gap-4",
                    item.available ? "bg-white border-blue-100 shadow-sm" : "bg-slate-50 border-slate-100 opacity-60"
                  )}>
                    <div className="flex items-center gap-4 flex-1">
                      {!item.delivered ? (
                        <button
                          onClick={() => toggleItem(index)}
                          className={cn(
                            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors",
                            item.available ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"
                          )}
                        >
                          {item.available && <Check size={14} strokeWidth={4} />}
                        </button>
                      ) : (
                        <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                          <Check size={14} strokeWidth={4} />
                        </div>
                      )}
                      <div>
                        <p className="font-bold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-500">{item.dosage} • {item.duration}</p>
                        {item.delivered && (
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Déjà Livré</span>
                        )}
                      </div>
                    </div>

                    {item.available && !item.delivered && (
                      <div className="w-32">
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="Prix DA"
                            className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-100 outline-hidden"
                            value={item.price}
                            onChange={(e) => setPrice(index, e.target.value)}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">DA</span>
          </div>
        </div>
      )}

                    {item.delivered && (
                      <div className="text-right">
                        <p className="font-black text-slate-800 text-sm">{item.price} DA</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>

                <div className="pt-6 border-t border-slate-50 flex flex-col gap-6">
                  <div className="flex justify-between items-center bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Montant à Payer (Sélection actuelle) :</span>
                    <span className="text-3xl font-black text-blue-600 tracking-tight">{currentTotal.toFixed(2)} DA</span>
                  </div>

                  <div className="flex gap-4">
                    <button
                      onClick={handleFinalDispense}
                      disabled={dispenseLoading || availableItems.every(i => !i.available)}
                      className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-xl shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {dispenseLoading ? "Traitement..." : (
                        <>
                          <CheckCircle size={20} />
                          Valider & Imprimer Bon de Livraison
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setFoundPrescription(null)}
                      className="px-6 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black hover:bg-slate-200 transition-all"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-20 text-slate-300"
          >
            <Microscope size={64} strokeWidth={1} />
            <p className="mt-4 font-medium italic text-slate-400">En attente de scan...</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const { t, i18n } = useTranslation();
  const isRTL = i18n.language === 'ar';

  // Hidden management route check
  const [isAdminRoute] = useState(window.location.pathname === "/management-99");

  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'forgot'>('login');
  const [authLoading, setAuthLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stats, setStats] = useState({ totalPatients: 0, appointmentsToday: 0, consultationsThisMonth: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscriptionExpired, setSubscriptionExpired] = useState(false);
  const [expiredUser, setExpiredUser] = useState<any>(null);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Themes & Font Size
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("medicab_theme") as Theme) || 'light');
  const [fontSize, setFontSize] = useState<FontSize>(() => (localStorage.getItem("medicab_fontsize") as FontSize) || 'medium');

  const saveThemeSettings = useCallback(() => {
    if (!user) return;
    try {
      const currentSettings = JSON.parse(localStorage.getItem('medicab_prescription_template') || '{}');
      api.saveUserSettings({ ...currentSettings, theme, fontSize }).catch(() => {});
    } catch {}
  }, [user, theme, fontSize]);

  useEffect(() => {
    localStorage.setItem("medicab_theme", theme);
    document.documentElement.setAttribute('data-theme', theme);
    saveThemeSettings();
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("medicab_fontsize", fontSize);
    document.documentElement.setAttribute('data-fontsize', fontSize);
    saveThemeSettings();
  }, [fontSize]);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const interval = setInterval(loadNotifications, 60000);
    // Load per-user settings (theme, fontSize)
    api.getUserSettings().then(settings => {
      if (settings && typeof settings === 'object') {
        if (settings.theme && ['light', 'dark', 'night', 'medical', 'duo', 'moderne'].includes(settings.theme)) {
          setTheme(settings.theme);
        }
        if (settings.fontSize && ['small', 'medium', 'large'].includes(settings.fontSize)) {
          setFontSize(settings.fontSize);
        }
      }
    }).catch(() => {});
    return () => clearInterval(interval);
  }, [user]);

  const loadNotifications = async () => {
    try {
      const notes = await api.getNotifications();
      setNotifications(notes);
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
  };

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language;
  }, [isRTL, i18n.language]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem("medicab_token");
    if (!token) {
      setAuthLoading(false);
      return;
    }
    try {
      const u = await api.getMe();
      if (u.subscription_end_date && new Date(u.subscription_end_date) < new Date()) {
        localStorage.removeItem("medicab_token");
        setSubscriptionExpired(true);
        setExpiredUser(u);
        setSubscriptionError(`Votre abonnement a expiré le ${new Date(u.subscription_end_date).toLocaleDateString('fr-FR')}.`);
      } else {
        setUser(u);
      }
    } catch (err) {
      localStorage.removeItem("medicab_token");
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (user && (user.role === 'doctor' || user.role === 'secretary')) {
      if (user.role === 'secretary' && currentPage === 'dashboard') setCurrentPage('patients');
      loadData();
    } else if (user && user.role === 'pharmacist') {
      loadPharmacistData();
    } else if (user && (user.role === 'laboratory' || user.role === 'imaging_center')) {
      if (currentPage === 'dashboard') setCurrentPage('lab-dashboard');
      loadLabData();
    }
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, a, s] = await Promise.all([
        api.getPatients(),
        api.getAppointments(),
        api.getDashboardStats()
      ]);
      setPatients(p);
      setAppointments(a);
      setStats(s);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const [searchTerm, setSearchTerm] = useState("");

  const filteredPatients = patients.filter(p =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone?.includes(searchTerm) ||
    p.nss?.includes(searchTerm)
  );

  const [pendingAppointmentId, setPendingAppointmentId] = useState<number | null>(null);
  const [pendingAppointmentReason, setPendingAppointmentReason] = useState("");

  const navigateToPatient = (id: number, appointment?: Appointment) => {
    if (appointment) {
      setPendingAppointmentId(appointment.id);
      setPendingAppointmentReason(appointment.reason);
    } else {
      setPendingAppointmentId(null);
      setPendingAppointmentReason("");
    }
    setSelectedPatientId(id);
    setCurrentPage("patient-detail");
  };

  const [pharmacistPrescriptions, setPharmacistPrescriptions] = useState<Prescription[]>([]);
  const loadPharmacistData = async () => {
    setLoading(true);
    try {
      const pr = await api.getPharmacistPrescriptions();
      setPharmacistPrescriptions(pr);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const [labRequests, setLabRequests] = useState<any[]>([]);
  const loadLabData = async () => {
    setLoading(true);
    try {
      const reqs = await api.getLabRequests();
      setLabRequests(reqs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("Login attempt...");
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    setLoading(true);
    setError(null);
    try {
      const { user: u, token } = await api.login({ email, password });
      if (u.subscription_end_date && new Date(u.subscription_end_date) < new Date()) {
        setError(`Votre abonnement a expiré le ${new Date(u.subscription_end_date).toLocaleDateString('fr-FR')}. Veuillez contacter le concepteur au 0658531833 ou gacemiamine@gmail.com pour le renouveler.`);
        setLoading(false);
        return;
      }
      console.log("Login success:", u);
      localStorage.setItem("medicab_token", token);
      setUser(u);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err instanceof Error ? err.message : "Identifiants incorrects");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("medicab_token");
    setUser(null);
    setCurrentPage("dashboard");
  };

  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState(false);

  const handleForgotPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const email = formData.get("email") as string;
      await api.forgotPassword(email);
      setForgotPasswordSuccess(true);
      setResetMode(true);
    } catch (err: any) {
      setForgotPasswordSuccess(true);
      setResetMode(true);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setResetError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const token = formData.get("reset_token") as string;
      const password = formData.get("new_password") as string;
      const confirm = formData.get("confirm_password") as string;
      if (password !== confirm) {
        setResetError("Les mots de passe ne correspondent pas");
        setLoading(false);
        return;
      }
      if (password.length < 6) {
        setResetError("Le mot de passe doit contenir au moins 6 caractères");
        setLoading(false);
        return;
      }
      await api.resetPassword(token.trim(), password);
      setResetDone(true);
      setResetMode(false);
    } catch (err: any) {
      setResetError(err?.message || "Token invalide ou expiré. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isAdminRoute) {
    return <AdminPortal />;
  }

  if (subscriptionExpired && expiredUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 text-center">
          <div className="bg-red-600 p-8 text-white">
            <CalendarRange size={48} className="mx-auto mb-4" />
            <h1 className="text-2xl font-black tracking-tighter">Abonnement Expiré</h1>
          </div>
          <div className="p-8 space-y-6">
            <p className="text-slate-700 font-medium">{subscriptionError}</p>
            <p className="text-sm text-slate-500">Veuillez contacter le concepteur pour renouveler votre abonnement :</p>
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3 text-left">
              <p className="text-sm font-bold text-slate-800">Gacemi Mohamed El Amine</p>
              <div className="flex items-center gap-2 text-sm text-slate-600"><Mail size={16} /> gacemiamine@gmail.com</div>
              <div className="flex items-center gap-2 text-sm text-slate-600"><Phone size={16} /> 0658531833</div>
            </div>
            <button onClick={() => { localStorage.removeItem('medicab_token'); setUser(null); setSubscriptionExpired(false); }} className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all">Déconnexion</button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 font-sans">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100"
        >
          <div className="bg-blue-600 p-8 text-white text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <Activity size={48} className="mx-auto mb-4" />
            <h1 className="text-3xl font-black tracking-tighter text-white">Gestion de Cabinet Médical</h1>
            <p className="opacity-80 text-sm mt-2 font-medium">Système de Gestion Médicale Multi-utilisateurs</p>
          </div>

          <div className="p-8">
            <div className="mb-8 text-center">
              <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Accès Professionnel</h2>
              <p className="text-slate-500 text-sm font-medium mt-1">Connectez-vous à votre espace cabinet</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold flex items-center gap-3 border border-red-100">
                <AlertCircle size={16} />
                {error}
              </div>
            )}

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Email</label>
                  <input type="email" name="email" required placeholder="votre@email.com" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-medium text-sm outline-hidden" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Mot de passe</label>
                  <input type="password" name="password" required placeholder="••••••••" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-medium text-sm outline-hidden" />
                </div>
                <div className="flex justify-end pr-1">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setError(null); }}
                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 mt-4 cursor-pointer"
                >
                  {loading ? "Chargement..." : "Se connecter"}
                </button>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="text-center">
                  <h3 className="font-bold text-slate-800">Recupération du compte</h3>
                  <p className="text-sm text-slate-500 mt-1">Saisissez votre email pour recevoir les instructions.</p>
                </div>
                {forgotPasswordSuccess && resetDone ? (
                  <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 text-center">
                    <ShieldCheck className="mx-auto text-emerald-500 mb-2" size={32} />
                    <p className="text-sm font-bold text-emerald-700">Mot de passe réinitialisé !</p>
                    <p className="text-xs text-emerald-600 mt-1">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
                    <button
                      onClick={() => { setAuthMode('login'); setForgotPasswordSuccess(false); setResetDone(false); }}
                      className="mt-4 text-xs font-black text-emerald-700 uppercase tracking-widest hover:underline"
                    >
                      Retour à la connexion
                    </button>
                  </div>
                ) : forgotPasswordSuccess && resetMode ? (
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center">
                      <Mail className="mx-auto text-blue-500 mb-2" size={28} />
                      <p className="text-sm font-bold text-blue-700">Email envoyé !</p>
                      <p className="text-xs text-blue-600 mt-1">Vérifiez votre boîte de réception et saisissez le code reçu.</p>
                    </div>
                    <form onSubmit={handleResetPassword} className="space-y-4">
                      {resetError && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl">{resetError}</p>}
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Code de réinitialisation</label>
                        <input type="text" name="reset_token" required placeholder="Collez le code reçu par email..." className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-mono text-sm outline-hidden" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nouveau mot de passe</label>
                        <input type="password" name="new_password" required placeholder="Minimum 6 caractères" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-medium text-sm outline-hidden" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Confirmer le mot de passe</label>
                        <input type="password" name="confirm_password" required placeholder="Répétez le mot de passe" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-medium text-sm outline-hidden" />
                      </div>
                      <button type="submit" disabled={loading} className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-200 hover:scale-[1.02] active:scale-[0.98] transition-all mt-2 cursor-pointer disabled:opacity-50">
                        {loading ? "Réinitialisation..." : "Réinitialiser le mot de passe"}
                      </button>
                      <button type="button" onClick={() => { setAuthMode('login'); setForgotPasswordSuccess(false); setResetMode(false); }} className="w-full py-2 text-slate-500 font-bold text-sm hover:text-blue-600 cursor-pointer">
                        Retour à la connexion
                      </button>
                    </form>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Email de récupération</label>
                      <input type="email" name="email" required placeholder="votre@email.com" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-medium text-sm outline-hidden" />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:scale-[1.02] active:scale-[0.98] transition-all mt-2 cursor-pointer disabled:opacity-50"
                    >
                      {loading ? "Envoi..." : "Envoyer le lien"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('login')}
                      className="w-full py-2 text-slate-500 font-bold text-sm hover:text-blue-600 cursor-pointer"
                    >
                      Retour à la connexion
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </motion.div>

        <p className="mt-8 text-slate-400 text-xs font-bold uppercase tracking-widest">PostgreSQL Multi-Cabinet Solution</p>
      </div>
    );
  }

  const nav = (page: Page) => { setSelectedPatientId(null); setCurrentPage(page); setSidebarOpen(false); };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Mobile backdrop */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed md:sticky inset-y-0 left-0 z-40 w-64 bg-white border-e border-slate-200 p-6 flex flex-col gap-4 transition-transform duration-300 md:translate-x-0 max-h-screen overflow-hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-2 shrink-0">
          <div className="bg-blue-600 p-2 rounded-lg text-white shrink-0">
            <Activity size={24} />
          </div>
          <h1 className="text-sm md:text-base font-bold tracking-tight text-blue-900 md:tracking-tighter truncate">Gestion de Cabinet Médical</h1>
          {/* Close button on mobile */}
          <button onClick={() => setSidebarOpen(false)} className="md:hidden ml-auto p-1 text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto" onClick={() => setSidebarOpen(false)}>
          {(user.role === 'doctor' || user.role === 'secretary') ? (
            <>
              {user.role === 'doctor' && <SidebarItem
                icon={Activity}
                label={t("dashboard")}
                active={currentPage === "dashboard"}
                onClick={() => nav("dashboard")}
              />}
              <SidebarItem
                icon={Users}
                label={t("patients")}
                active={currentPage === "patients"}
                onClick={() => nav("patients")}
              />
              <SidebarItem
                icon={Calendar}
                label={t("appointments")}
                active={currentPage === "appointments" || currentPage === "calendar"}
                onClick={() => nav("appointments")}
              />
              {user.role === 'doctor' && <SidebarItem
                icon={ClipboardList}
                label={t("medical_records")}
                active={currentPage === "medical-records"}
                onClick={() => nav("medical-records")}
              />}
            </>
          ) : user.role === 'laboratory' ? (
            <SidebarItem
              icon={FlaskConical}
              label="Demandes d'analyses"
              active={currentPage === "lab-dashboard"}
              onClick={() => nav("lab-dashboard")}
            />
          ) : user.role === 'imaging_center' ? (
            <SidebarItem
              icon={ImageIcon}
              label="Centre d'imagerie"
              active={currentPage === "lab-dashboard"}
              onClick={() => nav("lab-dashboard")}
            />
          ) : (
            <SidebarItem
              icon={FileSearch}
              label="Ordonnances"
              active={currentPage === "dashboard"}
              onClick={() => setCurrentPage("dashboard")}
            />
          )}
        </nav>

        <div className="pt-4 border-t border-slate-100 flex flex-col gap-4 shrink-0">
          <div className="px-2 py-3 bg-slate-50 rounded-2xl border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center font-black shrink-0">
                {user.full_name.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="text-[11px] font-black text-blue-600 truncate uppercase tracking-widest">{user.clinic_name || (user.role === 'doctor' ? t("role_doctor") : user.role === 'secretary' ? t("role_secretary") : user.role === 'laboratory' ? t("role_laboratory") : user.role === 'imaging_center' ? "Centre d'Imagerie" : t("role_pharmacist"))}</p>
                <p className="text-sm font-black text-slate-800 truncate">{user.full_name}</p>
                {user.specialty && <p className="text-[10px] font-bold text-slate-400 truncate uppercase tracking-widest">{user.specialty}</p>}
                {user.subscription_end_date && (
                  <div className="flex items-center gap-1 mt-1">
                    <CalendarRange size={10} className="text-slate-400" />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${new Date(user.subscription_end_date) < new Date() ? 'text-red-500' : 'text-emerald-600'}`}>
                      {new Date(user.subscription_end_date) < new Date() ? t("subscription_expired_badge") : t("subscription_valid_until") + ' ' + new Date(user.subscription_end_date).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-2">
            <button
              onClick={() => i18n.changeLanguage('fr')}
              className={cn("text-xs font-semibold px-2 py-1 rounded", i18n.language === 'fr' ? 'bg-blue-100 text-blue-700' : 'text-slate-400')}
            >FR</button>
            <button
              onClick={() => i18n.changeLanguage('ar')}
              className={cn("text-xs font-semibold px-2 py-1 rounded", i18n.language === 'ar' ? 'bg-blue-100 text-blue-700' : 'text-slate-400')}
            >AR</button>
            <button
              onClick={() => i18n.changeLanguage('en')}
              className={cn("text-xs font-semibold px-2 py-1 rounded", i18n.language === 'en' ? 'bg-blue-100 text-blue-700' : 'text-slate-400')}
            >EN</button>
          </div>
          <SidebarItem
            icon={MessageCircle}
            label={t("contact_nav")}
            active={currentPage === "contact"}
            onClick={() => nav("contact")}
          />
          {user.role === 'doctor' && <SidebarItem
            icon={Users}
            label={t("directory_nav")}
            active={currentPage === "directory"}
            onClick={() => nav("directory")}
          />}
          <SidebarItem
            icon={Settings}
            label={t("settings")}
            active={currentPage === "settings"}
            onClick={() => nav("settings")}
          />
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full p-3 rounded-xl text-red-500 hover:bg-red-50 transition-all font-bold text-sm"
          >
            <X size={20} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-3 md:p-8 overflow-auto">
        <header className="flex justify-between items-start md:items-center gap-3 mb-4 md:mb-8">
          <div className="min-w-0 flex items-center gap-3">
            {/* Hamburger */}
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 -ml-1 text-slate-500 hover:text-blue-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-xl md:text-3xl font-bold text-slate-800 tracking-tight capitalize truncate">
                {user.role === 'pharmacist' && currentPage === 'dashboard' ? 'Espace Pharmacien' : user.role === 'laboratory' && currentPage === 'lab-dashboard' ? 'Espace Laboratoire' : user.role === 'imaging_center' && currentPage === 'lab-dashboard' ? 'Espace Imagerie' : t(currentPage.replace('-', '_'))}
              </h2>
              <p className="text-[10px] md:text-sm text-slate-500 mt-0.5 md:mt-1 truncate">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 md:p-3 bg-white text-slate-500 rounded-xl border border-slate-100 hover:bg-slate-50 hover:text-blue-600 transition-all relative"
              >
                {notifications.some(n => !n.is_read) ? <BellRing size={18} className="text-blue-600 animate-pulse" /> : <Bell size={18} />}
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span className="absolute -top-1 -right-1 md:top-2 md:right-2 w-3.5 h-3.5 md:w-4 md:h-4 bg-red-500 text-white text-[10px] md:text-[10px] font-black rounded-full flex items-center justify-center border border-white md:border-2">
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 overflow-hidden"
                    >
                      <div className="p-4 border-b border-slate-50 flex items-center justify-between">
                        <h4 className="font-black text-slate-800 uppercase tracking-widest text-[10px]">Notifications</h4>
                        <button
                          onClick={async () => {
                            await api.markAllNotificationsRead();
                            loadNotifications();
                          }}
                          className="text-[10px] font-black text-blue-600 uppercase hover:underline"
                        >
                          Tout marquer lu
                        </button>
                      </div>
                      <div className="max-h-96 overflow-y-auto custom-scrollbar">
                        {notifications.length > 0 ? (
                          notifications.map(note => (
                            <button
                              key={note.id}
                              onClick={async () => {
                                await api.markNotificationRead(note.id);
                                loadNotifications();
                                if (note.type === 'patient_shared' && note.data?.patient_id) {
                                  navigateToPatient(note.data.patient_id);
                                }
                                if (note.type === 'medical_message' && note.data?.patient_id) {
                                  navigateToPatient(note.data.patient_id);
                                }
                                if (note.type === 'lab_request' || note.type === 'lab_result') {
                                  setCurrentPage(user.role === 'laboratory' || user.role === 'imaging_center' ? 'lab-dashboard' : 'dashboard');
                                }
                                setShowNotifications(false);
                              }}
                              className={cn(
                                "w-full text-left p-4 hover:bg-slate-50 border-b border-slate-50 transition-colors flex gap-3",
                                !note.is_read && "bg-blue-50/50"
                              )}
                            >
                              <div className={cn(
                                "w-8 h-8 rounded-lg flex shrink-0 items-center justify-center",
                                note.type === 'patient_shared' ? "bg-indigo-100 text-indigo-600" : note.type === 'exam_added' ? "bg-emerald-100 text-emerald-600" : note.type === 'report_added' ? "bg-amber-100 text-amber-600" : note.type === 'medical_message' ? "bg-purple-100 text-purple-600" : note.type === 'lab_request' ? "bg-cyan-100 text-cyan-600" : note.type === 'lab_result' ? "bg-teal-100 text-teal-600" : "bg-blue-100 text-blue-600"
                              )}>
                                {note.type === 'patient_shared' ? <Share2 size={14} /> : note.type === 'exam_added' ? <Microscope size={14} /> : note.type === 'report_added' ? <FileText size={14} /> : note.type === 'medical_message' ? <MessageCircle size={14} /> : note.type === 'lab_request' ? <FlaskConical size={14} /> : note.type === 'lab_result' ? <FileText size={14} /> : <Bell size={14} />}
                              </div>
                              <div className="overflow-hidden">
                                <p className="text-[11px] font-black text-slate-800 uppercase tracking-tight">
                                  {note.title}
                                  {note.type === 'patient_shared' && note.data?.priority === 'urgent' && <span className="ml-2 px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-black uppercase tracking-widest inline-block align-middle">Urgent</span>}
                                  {note.type === 'patient_shared' && note.data?.priority === 'very_urgent' && <span className="ml-2 px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-black uppercase tracking-widest inline-block align-middle">Très urgent</span>}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{note.message}</p>
                                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">{format(new Date(note.created_at), "dd/MM à HH:mm")}</p>
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="p-8 text-center text-slate-400 italic text-xs">Aucune notification</div>
                        )}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-3">
              {(user.role === 'doctor' || user.role === 'secretary') && (
                <button
                  onClick={() => setCurrentPage("new-patient")}
                  className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-md"
                >
                  <UserPlus size={18} />
                  {t("add_patient")}
                </button>
              )}
              {user.role === 'pharmacist' && (
                <button
                  onClick={loadPharmacistData}
                  className="bg-slate-50 text-slate-600 px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-100 transition-colors border border-slate-200"
                >
                  <History size={18} />
                  Actualiser
                </button>
              )}
            </div>
          </div>
        </header>

        {error && (
          <div className="mb-8 p-6 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl shadow-sm">
            <div className="flex items-start gap-4">
              <div className="bg-amber-100 p-2 rounded-lg text-amber-600 mt-1">
                <Settings size={20} />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-bold mb-1">Configuration Requise</h4>
                <p className="text-sm opacity-90 leading-relaxed mb-4">
                  {(error.includes("DATABASE_URL") || error.includes("EAI_AGAIN") || error.includes("ECONNREFUSED") || error.match(/\bbase\b/))
                    ? "Erreur de connexion PostgreSQL : L'hôte est injoignable (ECONNREFUSED). Si vous utilisez 'localhost' ou '127.0.0.1', cela ne fonctionnera pas dans cet environnement. Vous devez utiliser une base de données distante (ex: Supabase, Neon). Vérifiez votre variable DATABASE_URL dans le panneau 'Secrets'."
                    : error.includes("schéma public") || error.includes("permissions")
                    ? "Problème de droits sur PostgreSQL : Votre utilisateur n'a pas la permission de créer des tables. Exécutez : GRANT ALL ON SCHEMA public TO postgres;"
                    : error}
                </p>
                <div className="flex gap-3">
                  <button onClick={loadData} className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-amber-700 transition-colors">
                    Réessayer la connexion
                  </button>
                  <span className="px-4 py-2 bg-white border border-amber-200 text-amber-700 rounded-xl text-xs font-bold uppercase tracking-wider">
                    Base SQLite locale
                  </span>
                </div>
              </div>
              <button onClick={() => setError(null)} className="text-amber-400 hover:text-amber-600">
                <X size={20} />
              </button>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {user.role === 'pharmacist' && currentPage === 'dashboard' ? (
             <motion.div
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: -20 }}
               key="pharmacist-dashboard"
             >
               <PharmacistDashboard
                 loading={loading}
                 user={user}
                 onDispense={() => {
                   loadPharmacistData();
                 }}
               />
             </motion.div>
          ) : currentPage === "dashboard" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              key="dashboard"
              className="space-y-8"
            >
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                <StatCard
                  title={t("total_patients")}
                  value={stats.totalPatients}
                  icon={Users}
                  trend="+12%"
                  color="blue"
                />
                <StatCard
                  title={t("patients_today")}
                  value={stats.appointmentsToday}
                  icon={Calendar}
                  trend="+5"
                  color="emerald"
                />
                <StatCard
                  title={t("consultations_this_month")}
                  value={stats.consultationsThisMonth}
                  icon={Stethoscope}
                  trend="+18%"
                  color="amber"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-8">
                {/* Recent Appointments */}
                <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-4 md:mb-6">
                    <h3 className="text-sm md:text-lg font-bold text-slate-800">{t("upcoming_appointments")}</h3>
                    <button className="text-blue-600 text-xs md:text-sm font-semibold hover:underline">{t("search")}</button>
                  </div>
                  <div className="space-y-3 md:space-y-4">
                    {appointments.length > 0 ? appointments.slice(0, 5).map(app => (
                      <AppointmentRow key={app.id} app={app} onClick={() => navigateToPatient(app.patient_id, app)} />
                    )) : (
                      <div className="text-center py-6 md:py-8 text-slate-400 italic">{t("no_appointments")}</div>
                    )}
                  </div>
                </div>

                {/* Quick Actions / New Patients */}
                <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex justify-between items-center mb-4 md:mb-6">
                    <h3 className="text-sm md:text-lg font-bold text-slate-800">{t("patients")}</h3>
                    <button onClick={() => setCurrentPage("patients")} className="text-blue-600 text-xs md:text-sm font-semibold hover:underline">{t("search")}</button>
                  </div>
                  <div className="space-y-3 md:space-y-4">
                    {patients.length > 0 ? patients.slice(0, 5).map(p => (
                      <PatientRow key={p.id} patient={p} onClick={() => navigateToPatient(p.id)} />
                    )) : (
                      <div className="text-center py-6 md:py-8 text-slate-400 italic">{t("no_patients")}</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentPage === "patients" && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              key="patients"
              className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
            >
              <div className="p-3 md:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder={t("search")}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl cursor-pointer hover:bg-emerald-100 transition-all text-[10px] md:text-[10px] font-black uppercase tracking-widest border border-emerald-200">
                    <FilePlus size={14} />
                    <span className="hidden sm:inline">Importer CSV</span>
                    <span className="sm:hidden">CSV</span>
                    <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        Papa.parse(text, {
                          header: true,
                          skipEmptyLines: true,
                          complete: async (results) => {
                            const formatted = results.data.map((row: any) => ({
                              first_name: row.first_name || row.firstname || row.FirstName || row.prenom || row.Prenom,
                              last_name: row.last_name || row.lastname || row.LastName || row.nom || row.Nom,
                              gender: row.gender || row.Gender || row.sexe || row.Sexe || 'male',
                              birth_date: row.birth_date || row.birthdate || row.BirthDate || row.date_naissance,
                              blood_group: row.blood_group || row.bloodgroup || row.BloodGroup || row.groupe_sanguin,
                              phone: row.phone || row.Phone || row.telephone || row.Telephone,
                              email: row.email || row.Email,
                              address: row.address || row.Address || row.adresse,
                              city: row.city || row.City || row.ville,
                              wilaya: row.wilaya || row.Wilaya,
                              profession: row.profession || row.Profession,
                              nss: row.nss || row.Nss || row.NSS || row.securite_sociale,
                              insurance: row.insurance || row.Insurance || row.assurance,
                              nin: row.nin || row.Nin || row.NIN,
                              emergency_contact: row.emergency_contact || row.emergencycontact || row.urgence,
                            })).filter(p => !!p.first_name || !!p.last_name);
                            if (formatted.length === 0) { alert("Aucun patient valide trouvé dans le fichier."); return; }
                            await api.importPatients(formatted);
                            alert(`${formatted.length} patients importés avec succès.`);
                            loadData();
                          }
                        });
                      } catch (err) { alert("Erreur lors de l'importation."); }
                      e.target.value = '';
                    }} />
                  </label>
                  <button onClick={async () => {
                    try {
                      const data = await api.exportPatients();
                      if (data.length === 0) { alert("Aucun patient à exporter."); return; }
                      const csv = Papa.unparse(data);
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = `patients_${format(new Date(), "yyyyMMdd")}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                    } catch (err) { alert("Erreur lors de l'exportation."); }
                  }} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all text-[10px] font-black uppercase tracking-widest border border-blue-200">
                    <FileText size={14} />
                    Exporter CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-6 py-4">{t("last_name")}</th>
                      <th className="px-6 py-4">{t("first_name")}</th>
                      <th className="px-6 py-4">{t("gender")}</th>
                      <th className="px-6 py-4">{t("age")}</th>
                      <th className="px-6 py-4">{t("phone")}</th>
                      <th className="px-6 py-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredPatients.map(p => (
                      <tr key={p.id} className="hover:bg-blue-50/30 transition-colors cursor-pointer" onClick={() => navigateToPatient(p.id)}>
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-bold text-slate-700">{p.last_name}</p>
                            {(p as any).access_role === 'shared' && (p as any).share_reason && (
                              <p className={cn(
                                "text-xs font-bold mt-0.5 flex items-center gap-1.5",
                                (p as any).share_priority === 'very_urgent' ? 'text-red-600' :
                                (p as any).share_priority === 'urgent' ? 'text-orange-500' : 'text-emerald-600'
                              )}>
                                <span className={cn(
                                  "w-2 h-2 rounded-full inline-block",
                                  (p as any).share_priority === 'very_urgent' ? 'bg-red-600' :
                                  (p as any).share_priority === 'urgent' ? 'bg-orange-500' : 'bg-emerald-600'
                                )} />
                                {(p as any).share_reason}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{p.first_name}</td>
                        <td className="px-6 py-4 text-slate-500 text-sm">
                          <span className={cn(
                            "px-2 py-1 rounded-full text-[10px] font-bold uppercase",
                            p.gender === 'male' ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                          )}>
                            {t(p.gender || 'other')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600 text-sm">
                          {p.birth_date ? new Date().getFullYear() - new Date(p.birth_date).getFullYear() : '-'} {t("years")}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-mono text-sm">{p.phone}</td>
                        <td className="px-6 py-4 text-right">
                          <ChevronRight className="inline text-slate-300" size={18} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {currentPage === "appointments" && (
            <AppointmentManager
              appointments={appointments}
              onPatientClick={(id, app) => navigateToPatient(id, app)}
              onRefresh={loadData}
              onSwitchToCalendar={() => setCurrentPage("calendar")}
            />
          )}

          {currentPage === "calendar" && (
            <CalendarView
              appointments={appointments}
              onNavigateToPatient={(id, app) => navigateToPatient(id, app)}
              onBackToList={() => setCurrentPage("appointments")}
              onRefresh={loadData}
            />
          )}

          {currentPage === "new-patient" && (
            <PatientForm
              onCancel={() => setCurrentPage("dashboard")}
              onSuccess={() => { loadData(); setCurrentPage("patients"); }}
            />
          )}

          {currentPage === "contact" && (
            <ContactPage />
          )}

          {currentPage === "directory" && (
            <DoctorDirectory />
          )}

          {currentPage === "settings" && (
            <SettingsPage
              theme={theme}
              setTheme={setTheme}
              fontSize={fontSize}
              setFontSize={setFontSize}
            />
          )}

          {currentPage === "medical-records" && (
            <MedicalRecordsPage
              onPatientClick={navigateToPatient}
            />
          )}

          {currentPage === "patient-detail" && selectedPatientId && (
            <PatientDetail
              id={selectedPatientId}
              onBack={() => setCurrentPage("patients")}
              user={user}
              pendingAppointmentId={pendingAppointmentId}
              onClearPendingAppointment={() => { setPendingAppointmentId(null); setPendingAppointmentReason(""); }}
              pendingAppointmentReason={pendingAppointmentReason}
            />
          )}

          {currentPage === "lab-dashboard" && (
            <LabDashboard
              labRequests={labRequests}
              loading={loading}
              onRefresh={loadLabData}
              user={user}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  doctor: 'bg-blue-100 text-blue-700',
  laboratory: 'bg-purple-100 text-purple-700',
  dentist: 'bg-teal-100 text-teal-700',
  radiologist: 'bg-amber-100 text-amber-700',
  imaging_center: 'bg-pink-100 text-pink-700',
  pharmacist: 'bg-emerald-100 text-emerald-700',
  nurse: 'bg-cyan-100 text-cyan-700',
};

function DoctorDirectory() {
  const { t } = useTranslation();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState({ q: '', wilaya: '', city: '', specialty: '', role: '' });
  const searchRef = useRef(search);
  searchRef.current = search;
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [showSpecDropdown, setShowSpecDropdown] = useState(false);
  const specRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getSpecialties().then(setSpecialties).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (specRef.current && !specRef.current.contains(e.target as Node)) setShowSpecDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredSpecialties = specialties.filter(s => s.toLowerCase().includes(search.specialty.toLowerCase()));

  const loadDoctors = useCallback(async (s?: typeof search) => {
    const vals = s ?? searchRef.current;
    setLoading(true);
    try {
      const data = await api.getDoctorsDirectory({
        q: vals.q || undefined,
        wilaya: vals.wilaya || undefined,
        city: vals.city || undefined,
        specialty: vals.specialty || undefined,
        role: vals.role || undefined,
      });
      setDoctors(data);
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la recherche: " + ((err as any)?.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDoctors(); }, [loadDoctors]);

  const doSearch = () => loadDoctors();

  const doReset = () => {
    const empty = { q: '', wilaya: '', city: '', specialty: '', role: '' };
    setSearch(empty);
    loadDoctors(empty);
  };

  const setRole = (role: string) => {
    setSearch(s => ({ ...s, role }));
    const next = { ...searchRef.current, role };
    loadDoctors(next);
  };

  const roleChips = [
    { key: '', label: 'Tous', color: 'bg-slate-100 text-slate-700' },
    { key: 'doctor', label: t('doctors_role'), color: 'bg-blue-100 text-blue-700' },
    { key: 'laboratory', label: t('labs_role'), color: 'bg-purple-100 text-purple-700' },
    { key: 'dentist', label: t('dentists_role'), color: 'bg-teal-100 text-teal-700' },
    { key: 'radiologist', label: t('radiologists_role'), color: 'bg-amber-100 text-amber-700' },
    { key: 'imaging_center', label: t('imaging_role'), color: 'bg-pink-100 text-pink-700' },
    { key: 'pharmacist', label: t('pharmacists_role'), color: 'bg-emerald-100 text-emerald-700' },
    { key: 'nurse', label: t('nurses_role'), color: 'bg-cyan-100 text-cyan-700' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{t("directory_title")}</h2>
        <p className="text-slate-500 mt-1">{t("directory_subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {roleChips.map(chip => (
          <button key={chip.key} onClick={() => setRole(chip.key)} className={cn("px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border-2", search.role === chip.key ? `${chip.color} border-current` : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300')}>
            {chip.label}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input type="text" placeholder="Nom..." className="w-full pl-10 pr-4 py-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={search.q} onChange={e => setSearch(s => ({...s, q: e.target.value}))} onKeyDown={e => e.key === 'Enter' && doSearch()} />
          </div>
          <div ref={specRef} className="relative">
            <input type="text" placeholder="Spécialité..." className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={search.specialty} onChange={e => { setSearch(s => ({...s, specialty: e.target.value})); setShowSpecDropdown(true); }} onFocus={() => setShowSpecDropdown(true)} onKeyDown={e => { if (e.key === 'Enter') { setShowSpecDropdown(false); doSearch(); } }} />
            {showSpecDropdown && filteredSpecialties.length > 0 && (
              <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto">
                {filteredSpecialties.map(s => (
                  <button key={s} type="button" className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border-b border-slate-50 last:border-0 uppercase" onMouseDown={() => { setSearch(prev => ({ ...prev, specialty: s })); setShowSpecDropdown(false); }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input type="text" placeholder="Wilaya..." className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={search.wilaya} onChange={e => setSearch(s => ({...s, wilaya: e.target.value}))} onKeyDown={e => e.key === 'Enter' && doSearch()} />
          <input type="text" placeholder="Commune..." className="w-full px-4 py-3 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={search.city} onChange={e => setSearch(s => ({...s, city: e.target.value}))} onKeyDown={e => e.key === 'Enter' && doSearch()} />
        </div>
        <div className="flex gap-3">
          <button onClick={doSearch} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-blue-700 transition-colors shadow-md">
            <Search size={16} className="inline mr-1" />
            Rechercher
          </button>
          <button onClick={doReset} className="px-6 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition-colors">
            Réinitialiser
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : doctors.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-slate-100">
          <Users size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-400 italic font-bold">Aucun professionnel trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">

          {doctors.map(doc => (
            <div key={doc.id} className="bg-white p-4 md:p-6 rounded-3xl shadow-sm border border-slate-100 hover:border-blue-200 transition-all">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-xl font-black shrink-0">
                  {doc.full_name?.charAt(0) || '?'}
                </div>
                <div className="overflow-hidden">
                  <p className="font-black text-slate-800 uppercase truncate">{doc.full_name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {doc.role && <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest", ROLE_COLORS[doc.role] || 'bg-slate-100 text-slate-600')}>{t("role_" + doc.role)}</span>}
                    {doc.specialty && <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{doc.specialty}</span>}
                  </div>
                  {doc.clinic_name && <p className="text-[10px] font-black text-slate-400 mt-0.5">{doc.clinic_name}</p>}
                </div>
              </div>
              <div className="space-y-2 text-xs text-slate-500">
                {doc.address && <p className="flex items-center gap-2"><span className="font-bold text-slate-400 w-16">{t("address_label")}</span>{doc.address}</p>}
                {doc.city && <p className="flex items-center gap-2"><span className="font-bold text-slate-400 w-16">{t("city_label")}</span>{doc.city}</p>}
                {doc.phone && <p className="flex items-center gap-2"><span className="font-bold text-slate-400 w-16">{t("phone_label")}</span>{doc.phone}</p>}
                {doc.email && <p className="flex items-center gap-2"><span className="font-bold text-slate-400 w-16">{t("directory_email")}</span>{doc.email}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function getReports(req: any): any[] {
  const reports: any[] = [];
  if (req.reports) {
    const parsed = typeof req.reports === 'string' ? (JSON.parse(req.reports) || []) : (req.reports || []);
    for (const r of parsed) reports.push(r);
  }
  if (reports.length === 0 && (req.report_text || req.report_pdf)) {
    reports.push({ text: req.report_text || '', pdf: req.report_pdf || '', created_at: req.completed_at });
  }
  return reports;
}

function viewReportPdf(reqId: number, index: number) {
  const token = localStorage.getItem("medicab_token");
  window.open(`/api/lab-requests/${reqId}/report/${index}?token=${token}`, '_blank');
}

function LabDashboard({ labRequests, loading, onRefresh, user }: { labRequests: any[], loading: boolean, onRefresh: () => void, user: User }) {
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [refusingId, setRefusingId] = useState<number | null>(null);
  const [refusalReason, setRefusalReason] = useState("");

  const handleComplete = async (id: number, file?: File | null) => {
    try {
      const req = labRequests.find(r => r.id === id);
      const data: any = {};
      const f = file ?? reportFile;
      if (reportText.trim()) data.report_text = reportText;
      if (f) {
        setUploadProgress(5);
        const b64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onprogress = (e) => {
            if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 25) + 5);
          };
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(f);
        });
        data.report_pdf = b64;
        setUploadProgress(30);
      }
      const url = req?.status === 'completed'
        ? `/api/lab-requests/${id}/report`
        : `/api/lab-requests/${id}/complete`;
      await api.uploadLabData(url, data, setUploadProgress);
      setUploadProgress(100);
      setTimeout(() => {
        setCompletingId(null);
        setReportText("");
        setReportFile(null);
        setUploadProgress(0);
        onRefresh();
      }, 500);
    } catch (err) {
      setUploadProgress(0);
      alert("Erreur lors de la complétion de la demande");
    }
  };

  const handleRefuse = async (id: number) => {
    if (!refusalReason.trim()) { alert("Veuillez saisir un motif de refus."); return; }
    try {
      await api.refuseLabRequest(id, refusalReason.trim());
      setRefusingId(null);
      setRefusalReason("");
      onRefresh();
    } catch (err) {
      alert("Erreur lors du refus de la demande");
    }
  };

  const pending = labRequests.filter(r => r.status === 'requested');
  const completed = labRequests.filter(r => r.status === 'completed');
  const refused = labRequests.filter(r => r.status === 'refused');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">{user.role === 'imaging_center' ? "Demandes d'imagerie" : "Demandes d'analyses"}</h2>
          <p className="text-slate-500 mt-1">{user.role === 'imaging_center' ? "Gérez les demandes d'examens radiologiques reçues" : "Gérez les demandes d'analyses reçues"}</p>
        </div>
        <button
          onClick={onRefresh}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-md text-sm"
        >
          <History size={16} />
          Actualiser
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : labRequests.length === 0 ? (
        <div className="bg-white rounded-3xl p-16 text-center shadow-sm border border-slate-100">
          <FlaskConical size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-400 italic font-bold">{user.role === 'imaging_center' ? "Aucune demande d'imagerie pour le moment" : "Aucune demande d'analyse pour le moment"}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-4 flex items-center gap-2">
                <Clock size={18} className="text-amber-500" />
                En attente ({pending.length})
              </h3>
              <div className="space-y-4">
                {pending.map(req => (
                  <div key={req.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-lg font-black text-slate-800 uppercase">{req.patient_last_name} {req.patient_first_name}</p>
                        <p className="text-xs text-slate-500 font-medium">Âge: {req.patient_age || '?'} ans</p>
                        {req.doctor_name && <p className="text-[10px] font-bold text-indigo-600">Dr. {req.doctor_name}</p>}
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Reçue le {format(new Date(req.created_at), "dd/MM/yyyy à HH:mm")}</p>
                      </div>
                      <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-xl text-[10px] font-black uppercase tracking-widest">En attente</span>
                    </div>
                    <div className="mb-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{user.role === 'imaging_center' ? "Examens demandés" : "Analyses demandées"}</p>
                      <div className="flex flex-wrap gap-2">
                        {(typeof req.requested_analyses === 'string' ? JSON.parse(req.requested_analyses) : req.requested_analyses || []).map((a: string, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold">{a}</span>
                        ))}
                      </div>
                    </div>
                    {completingId === req.id ? (
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                        <textarea
                          placeholder="Résultat du rapport..."
                          className="w-full px-4 py-3 bg-slate-50 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                          value={reportText}
                          onChange={e => setReportText(e.target.value)}
                        />
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fichier PDF (optionnel)</label>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            onChange={e => { const f = e.target.files?.[0] || null; setReportFile(f); if (f) handleComplete(req.id, f); }}
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                        </div>
                        {uploadProgress > 0 && (
                          <div className="space-y-1">
                            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                              <div className={cn("h-full rounded-full transition-all duration-300 ease-out", uploadProgress < 100 ? "bg-blue-600" : "bg-emerald-500")} style={{ width: `${uploadProgress}%` }}></div>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 text-right">{uploadProgress < 100 ? `${uploadProgress}%` : "Terminé ✓"}</p>
                          </div>
                        )}
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => { setCompletingId(null); setReportText(""); setReportFile(null); setUploadProgress(0); }} disabled={uploadProgress > 0 && uploadProgress < 100} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider disabled:opacity-50">Annuler</button>
                          <button onClick={() => handleComplete(req.id)} disabled={uploadProgress > 0 && uploadProgress < 100} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-100 disabled:opacity-50">
                            <Check size={16} className="inline mr-1" />
                            {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : uploadProgress >= 100 ? "Terminé" : "Valider le résultat"}
                          </button>
                        </div>
                      </div>
                    ) : refusingId === req.id ? (
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Motif de refus</label>
                          <textarea rows={3} placeholder="Très occupé, analyse non disponible, échantillon inadéquat..."
                            className="w-full px-4 py-3 bg-red-50 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-red-500 min-h-[80px] border border-red-100"
                            value={refusalReason} onChange={e => setRefusalReason(e.target.value)} />
                        </div>
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => { setRefusingId(null); setRefusalReason(""); }} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider">Annuler</button>
                          <button onClick={() => handleRefuse(req.id)} className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-100">
                            <X size={16} className="inline mr-1" />
                            Confirmer le refus
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCompletingId(req.id)}
                          className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                        >
                          <Upload size={16} className="inline mr-1" />
                          Compléter
                        </button>
                        <button
                          onClick={() => setRefusingId(req.id)}
                          className="px-5 py-2.5 bg-white text-red-600 border border-red-200 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-red-50 transition-all"
                        >
                          <X size={16} className="inline mr-1" />
                          Refuser
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {refused.length > 0 && (
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-4 flex items-center gap-2">
                <X size={18} className="text-red-500" />
                Refusées ({refused.length})
              </h3>
              <div className="space-y-4">
                {refused.map(req => (
                  <div key={req.id} className="bg-white rounded-3xl p-6 shadow-sm border border-red-100">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-lg font-black text-slate-800 uppercase">{req.patient_last_name} {req.patient_first_name}</p>
                        <p className="text-xs text-slate-500 font-medium">Âge: {req.patient_age || '?'} ans</p>
                        {req.doctor_name && <p className="text-[10px] font-bold text-indigo-600">Dr. {req.doctor_name}</p>}
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Reçue le {format(new Date(req.created_at), "dd/MM/yyyy à HH:mm")}</p>
                      </div>
                      <span className="px-3 py-1.5 bg-red-100 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest">Refusée</span>
                    </div>
                    <div className="mb-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{user.role === 'imaging_center' ? "Examens demandés" : "Analyses demandées"}</p>
                      <div className="flex flex-wrap gap-2">
                        {(typeof req.requested_analyses === 'string' ? JSON.parse(req.requested_analyses) : req.requested_analyses || []).map((a: string, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold">{a}</span>
                        ))}
                      </div>
                    </div>
                    {req.refusal_reason && (
                      <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                        <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-1">Motif du refus</p>
                        <p className="text-sm text-red-800 font-bold">{req.refusal_reason}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-4 flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-500" />
                Terminées ({completed.length})
              </h3>
              <div className="space-y-4">
                {completed.map(req => {
                  const reports = getReports(req);
                  return (
                  <div key={req.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="text-lg font-black text-slate-800 uppercase">{req.patient_last_name} {req.patient_first_name}</p>
                        <p className="text-xs text-slate-500 font-medium">Âge: {req.patient_age || '?'} ans</p>
                        {req.doctor_name && <p className="text-[10px] font-bold text-indigo-600">Dr. {req.doctor_name}</p>}
                        <p className="text-[10px] text-slate-400 font-bold mt-1">Complétée le {req.completed_at ? format(new Date(req.completed_at), "dd/MM/yyyy à HH:mm") : '-'}</p>
                      </div>
                      <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest">Terminée</span>
                    </div>
                    <div className="mb-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{user.role === 'imaging_center' ? "Examens demandés" : "Analyses demandées"}</p>
                      <div className="flex flex-wrap gap-2">
                        {(typeof req.requested_analyses === 'string' ? JSON.parse(req.requested_analyses) : req.requested_analyses || []).map((a: string, i: number) => (
                          <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold">{a}</span>
                        ))}
                      </div>
                    </div>
                    {reports.length > 0 && (
                      <div className="space-y-3 mb-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rapports ({reports.length})</p>
                        {reports.map((r: any, idx: number) => (
                          <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rapport #{idx + 1}{r.created_at ? ` • ${format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}` : ''}</p>
                              {r.pdf && (
                                <button
                                  onClick={() => viewReportPdf(req.id, idx)}
                                  className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1"
                                >
                                  <Download size={12} />
                                  PDF
                                </button>
                              )}
                            </div>
                            {r.text && <p className="text-sm text-slate-700 whitespace-pre-wrap">{r.text}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                    {completingId === req.id ? (
                      <div className="space-y-4 pt-4 border-t border-slate-100">
                        <textarea
                          placeholder="Nouveau résultat du rapport..."
                          className="w-full px-4 py-3 bg-slate-50 rounded-xl font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                          value={reportText}
                          onChange={e => setReportText(e.target.value)}
                        />
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fichier PDF (optionnel)</label>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            onChange={e => { const f = e.target.files?.[0] || null; setReportFile(f); if (f) handleComplete(req.id, f); }}
                            className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                          />
                        </div>
                        <div className="flex gap-3 justify-end">
                          {uploadProgress > 0 && (
                            <div className="space-y-1 w-full">
                              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className={cn("h-full rounded-full transition-all duration-300 ease-out", uploadProgress < 100 ? "bg-blue-600" : "bg-emerald-500")} style={{ width: `${uploadProgress}%` }}></div>
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 text-right">{uploadProgress < 100 ? `${uploadProgress}%` : "Terminé ✓"}</p>
                            </div>
                          )}
                          <button onClick={() => { setCompletingId(null); setReportText(""); setReportFile(null); setUploadProgress(0); }} disabled={uploadProgress > 0 && uploadProgress < 100} className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider disabled:opacity-50">Annuler</button>
                          <button onClick={() => handleComplete(req.id)} disabled={uploadProgress > 0 && uploadProgress < 100} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-100 disabled:opacity-50">
                            <Check size={16} className="inline mr-1" />
                            {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : uploadProgress >= 100 ? "Terminé" : "Ajouter ce rapport"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setCompletingId(req.id); setReportText(""); setReportFile(null); setUploadProgress(0); }}
                        className="px-5 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-100"
                      >
                        <Upload size={16} className="inline mr-1" />
                        Ajouter un rapport
                      </button>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function StatCard({ title, value, icon: Icon, trend, color }: { title: string, value: number, icon: any, trend: string, color: 'blue' | 'emerald' | 'amber' }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600"
  };

  return (
    <div className="bg-white p-3 md:p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
      <div className="flex items-center gap-2 md:gap-4">
        <div className={cn("p-2 md:p-4 rounded-2xl", colors[color])}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-[10px] md:text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <p className="text-xl md:text-3xl font-extrabold text-slate-800">{value}</p>
        </div>
      </div>
      </div>
  );
}

function AppointmentRow({ app, onClick }: { app: Appointment, onClick: () => void, key?: React.Key }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group"
    >
      <div className="flex items-center gap-4">
        <div className="bg-white p-2.5 rounded-lg shadow-sm font-serif text-center min-w-[60px]">
          <p className="text-xs font-bold text-slate-400 uppercase">{format(new Date(app.date), "MMM")}</p>
          <p className="text-xl font-black text-slate-700 leading-tight">{format(new Date(app.date), "dd")}</p>
        </div>
        <div>
          <p className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors uppercase">{app.last_name} {app.first_name}</p>
          <p className="text-sm text-slate-500 font-medium">{app.reason}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-slate-400 font-mono text-sm">
        <Clock size={14} />
        {app.hour?.slice(0, 5)}
      </div>
    </div>
  );
}

function PatientRow({ patient, onClick }: { patient: Patient, onClick: () => void, key?: React.Key }) {
  const { t } = useTranslation();
  const shareReason = (patient as any).share_reason;
  const sharePriority = (patient as any).share_priority;
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer group border border-transparent hover:border-slate-200"
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold shrink-0">
          {patient.last_name?.[0]}{patient.first_name?.[0]}
        </div>
        <div className="min-w-0">
          <p className="font-bold text-slate-800 uppercase tracking-tighter">{patient.last_name} {patient.first_name}</p>
          {shareReason && (
            <p className={cn(
              "text-xs font-bold mt-0.5 flex items-center gap-1.5",
              sharePriority === 'very_urgent' ? 'text-red-600' :
              sharePriority === 'urgent' ? 'text-orange-500' : 'text-emerald-600'
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full inline-block shrink-0",
                sharePriority === 'very_urgent' ? 'bg-red-600' :
                sharePriority === 'urgent' ? 'bg-orange-500' : 'bg-emerald-600'
              )} />
              <span className="truncate">{shareReason}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-400 font-mono italic">{patient.phone}</p>
            {patient.nin && (
              <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-black">NIN: {patient.nin}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-slate-400 text-sm shrink-0">
         <span className="bg-white px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 uppercase border border-slate-100 tracking-tight">
          {patient.gender ? t(patient.gender) : '-'}
        </span>
        <ChevronRight size={18} />
      </div>
    </div>
  );
}

function PatientForm({ initialData, onCancel, onSuccess }: { initialData?: Patient, onCancel: () => void, onSuccess: () => void }) {
  const { t } = useTranslation();
  const initialAge = initialData?.age || (initialData?.birth_date ? new Date().getFullYear() - new Date(initialData.birth_date).getFullYear() : undefined);
  const [formData, setFormData] = useState<Partial<Patient>>(initialData ? { ...initialData, age: initialAge } : {
    gender: 'male',
    wilaya: 'Alger',
    blood_group: ''
  });

  const [doctors, setDoctors] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [linkedDoctorIds, setLinkedDoctorIds] = useState<number[]>([]);

  useEffect(() => {
    api.getMe().then(setMe).catch(console.error);
    api.getDoctors().then(setDoctors).catch(console.error);
  }, []);

  useEffect(() => {
    if (me?.role === 'secretary') {
      api.getSecretaryLinks().then((links: any[]) => {
        setLinkedDoctorIds(links.map((l: any) => l.doctor_id));
      }).catch(() => {});
    }
  }, [me]);

  const availableDoctors = linkedDoctorIds.length > 0
    ? doctors.filter(d => linkedDoctorIds.includes(d.id))
    : doctors;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (!initialData && me?.role === 'secretary' && !formData.doctor_id) {
        alert("Veuillez sélectionner le médecin responsable du dossier.");
        return;
      }
      if (!formData.birth_date && !formData.age) {
        alert("Veuillez saisir la date de naissance ou l'âge.");
        return;
      }
      if (initialData?.id) {
        await api.updatePatient(initialData.id, formData);
      } else {
        await api.createPatient(formData);
      }
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for simple storage
        alert("La photo est trop volumineuse (max 1Mo)");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, photo: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const wilayas = [
    "Adrar", "Chlef", "Laghouat", "Oum El Bouaghi", "Batna", "Béjaïa", "Biskra", "Béchar", "Blida", "Bouira",
    "Tamanrasset", "Tébessa", "Tlemcen", "Tiaret", "Tizi Ouzou", "Alger", "Djelfa", "Jijel", "Sétif", "Saïda",
    "Skikda", "Sidi Bel Abbès", "Annabba", "Guelma", "Constantine", "Médéa", "Mostaganem", "M'Sila", "Mascara",
    "Ouargla", "Oran", "El Bayadh", "Illizi", "Bordj Bou Arreridj", "Boumerdès", "El Tarf", "Tindouf",
    "Tissemsilt", "El Oued", "Khenchela", "Souk Ahras", "Tipaza", "Mila", "Aïn Defla", "Naâma", "Aïn Témouchent",
    "Ghardaïa", "Relizane"
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white p-8 rounded-3xl shadow-2xl border border-slate-100 max-w-5xl mx-auto my-8"
    >
      <div className="flex justify-between items-center mb-8">
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
          {initialData ? "Modifier Patient" : t("add_patient")}
        </h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {me?.role === 'secretary' && !initialData && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
            <label className="block text-[10px] font-bold text-blue-700 uppercase tracking-widest mb-2">Médecin responsable du dossier</label>
            <select required className="w-full px-4 py-3 bg-white rounded-xl border border-blue-100 font-bold text-slate-700" value={formData.doctor_id || ''} onChange={e => setFormData({ ...formData, doctor_id: parseInt(e.target.value) })}>
              <option value="">Sélectionner le médecin</option>
              {availableDoctors.map(d => <option key={d.id} value={d.id}>{d.full_name}{d.specialty ? ` - ${d.specialty}` : ''}</option>)}
            </select>
            {linkedDoctorIds.length > 0 && availableDoctors.length === 0 && <p className="text-[10px] text-red-500 font-bold mt-1">Aucun médecin lié à votre compte. Contactez l'administrateur.</p>}
            <p className="text-[11px] text-blue-700 font-bold mt-2">La secrétaire crée les informations administratives; les fonctions médicales restent réservées au médecin choisi.</p>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Identity Section */}
          <div className="space-y-6 md:col-span-2">
            <h4 className="text-sm font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
              <UserCog size={16} />
              Informations Personnelles
            </h4>

            <div className="flex items-center gap-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
               <div className="relative group">
                 <div className="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 overflow-hidden relative">
                   {formData.photo ? (
                     <img src={formData.photo} alt="Preview" className="w-full h-full object-cover" />
                   ) : (
                     <Camera size={32} />
                   )}
                 </div>
                 <input
                   type="file"
                   accept="image/*"
                   onChange={handlePhotoChange}
                   className="absolute inset-0 opacity-0 cursor-pointer"
                 />
                 <div className="absolute -bottom-2 -right-2 bg-blue-600 text-white p-1.5 rounded-lg shadow-lg">
                    <Plus size={12} />
                 </div>
               </div>
               <div>
                   <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Photo du Patient</p>
                  <p className="text-xs text-slate-500 mt-1 italic">Cliquez pour télécharger (JPG, PNG)</p>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("last_name")}</label>
                <input required type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.last_name || ''} onChange={e => setFormData({ ...formData, last_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Numéro d'Identification National (NIN)</label>
                <input type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.nin || ''} onChange={e => setFormData({ ...formData, nin: e.target.value })} placeholder="18 chiffres ou code unique" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("first_name")}</label>
                <input required type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.first_name || ''} onChange={e => setFormData({ ...formData, first_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("gender")}</label>
                <select className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value })}>
                  <option value="male">{t("male")}</option>
                  <option value="female">{t("female")}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("birth_date")}</label>
                <input type="date" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.birth_date ? format(new Date(formData.birth_date), "yyyy-MM-dd") : ''} onChange={e => { const bd = e.target.value; let age: number | undefined; if (bd) { const b = new Date(bd); age = new Date().getFullYear() - b.getFullYear() - (new Date() < new Date(b.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0); } setFormData({ ...formData, birth_date: bd, age }); }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Âge (ans)</label>
                <input type="number" min="0" max="150" placeholder="ex: 35" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.age ?? ''} onChange={e => { const a = e.target.value ? parseInt(e.target.value) : undefined; setFormData({ ...formData, age: a, birth_date: a !== undefined ? '' : formData.birth_date }); }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Profession</label>
                <input type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.profession || ''} onChange={e => setFormData({ ...formData, profession: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("group_sanguin")}</label>
                <select className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-700" value={formData.blood_group} onChange={e => setFormData({ ...formData, blood_group: e.target.value })}>
                  <option value="">Sélectionner</option>
                  {["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Contact Section */}
          <div className="space-y-6">
            <h4 className="text-sm font-black text-emerald-600 uppercase tracking-widest flex items-center gap-2">
              <ArrowRight size={16} />
              Coordonnées
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("phone")}</label>
                <input type="tel" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Téléphone Sec.</label>
                <input type="tel" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm" value={formData.phone_secondary || ''} onChange={e => setFormData({ ...formData, phone_secondary: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("email")}</label>
                <input type="email" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Address Section */}
           <div className="space-y-6">
              <h4 className="text-sm font-black text-amber-600 uppercase tracking-widest flex items-center gap-2">
                <Settings size={16} />
                Localisation
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("address")}</label>
                  <input type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ville</label>
                  <input type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Wilaya</label>
                  <select className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.wilaya} onChange={e => setFormData({ ...formData, wilaya: e.target.value })}>
                    {wilayas.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>
           </div>

           {/* Administrative Section */}
           <div className="space-y-6">
              <h4 className="text-sm font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={16} />
                Administratif & Contact d'urgence
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">N° Sécurité Sociale</label>
                  <input type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-mono text-xs" value={formData.nss || ''} onChange={e => setFormData({ ...formData, nss: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Assurance / Mutuelle</label>
                  <input type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="ex: CNAS, CASNOS" value={formData.insurance || ''} onChange={e => setFormData({ ...formData, insurance: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Contact d'urgence (Nom & Tél)</label>
                  <input type="text" className="w-full px-4 py-2.5 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" placeholder="ex: Ahmed (Frère) - 0661..." value={formData.emergency_contact || ''} onChange={e => setFormData({ ...formData, emergency_contact: e.target.value })} />
                </div>
              </div>
           </div>
        </div>

        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors uppercase tracking-wider text-xs">
            {t("cancel")}
          </button>
          <button type="submit" className="px-10 py-3 rounded-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100 uppercase tracking-wider text-xs">
            {t("save")}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

function MedicalHistoryForm({ patientId, initialData, onCancel, onSuccess }: { patientId: number, initialData: Patient['medical_history'], onCancel: () => void, onSuccess: () => void }) {
  const [formData, setFormData] = useState<Patient['medical_history']>(initialData || {});
  const [medLibrary, setMedLibrary] = useState<MedicationLibrary[]>([]);
  const [restrictionSearch, setRestrictionSearch] = useState('');
  const [intoleranceInput, setIntoleranceInput] = useState('');

  useEffect(() => {
    api.getMedicationsLibrary().then(setMedLibrary).catch(console.error);
  }, []);

  const restrictions = formData?.medication_restrictions || [];

  const addMedicationRestriction = (med: MedicationLibrary, type: 'allergy' | 'contraindication' = 'allergy') => {
    const exists = restrictions.some(r => r.medicationId === med.id && r.type === type);
    if (exists) return;
    setFormData({
      ...formData,
      medication_restrictions: [...restrictions, { type, medicationName: med.name, medicationId: med.id }]
    });
    setRestrictionSearch('');
  };

  const addClassRestriction = (med: MedicationLibrary) => {
    if (!med.classe) return;
    const exists = restrictions.some(r => r.type === 'class' && r.medicationName.toLowerCase() === med.classe!.toLowerCase());
    if (exists) return;
    setFormData({
      ...formData,
      medication_restrictions: [...restrictions, { type: 'class', medicationName: med.classe }]
    });
    setRestrictionSearch('');
  };

  const addIntoleranceRestriction = () => {
    const label = intoleranceInput.trim().toLowerCase();
    if (!label) return;
    const exists = restrictions.some(r => r.type === 'intolerance' && r.medicationName.toLowerCase() === label);
    if (exists) return;
    setFormData({
      ...formData,
      medication_restrictions: [...restrictions, { type: 'intolerance', medicationName: label }]
    });
    setIntoleranceInput('');
  };

  const removeRestriction = (index: number) => {
    const updated = restrictions.filter((_, i) => i !== index);
    setFormData({ ...formData, medication_restrictions: updated });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.updatePatient(patientId, { medical_history: formData });
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredMeds = restrictionSearch
    ? medLibrary.filter(m => m.name.toLowerCase().includes(restrictionSearch.toLowerCase()))
    : [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-3xl my-auto"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
            <History size={24} className="text-blue-600" />
            Dossier Médical Permanent
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
             <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Antécédents Médicaux</label>
                <textarea rows={3} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData?.medical || ''} onChange={e => setFormData({ ...formData, medical: e.target.value })} placeholder="Pathologies, maladies chroniques..." />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Antécédents Chirurgicaux</label>
                <textarea rows={3} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData?.surgical || ''} onChange={e => setFormData({ ...formData, surgical: e.target.value })} placeholder="Opérations, interventions..." />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Antécédents Familiaux</label>
                <textarea rows={3} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData?.family || ''} onChange={e => setFormData({ ...formData, family: e.target.value })} placeholder="Diabète, HTA, cardiopathies dans la famille..." />
             </div>
             <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Allergies</label>
                  <textarea rows={2} className="w-full px-4 py-2 bg-rose-50 border border-rose-100 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-sm text-rose-900 font-bold" value={formData?.allergies || ''} onChange={e => setFormData({ ...formData, allergies: e.target.value })} placeholder="Médicaments, aliments..." />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Médicaments à risques</label>
                  <p className="text-[9px] text-slate-400 mb-2">Allergies ou intolérances à des médicaments spécifiques</p>
                  <div className="relative">
                    <input type="text" value={restrictionSearch} onChange={e => setRestrictionSearch(e.target.value)} placeholder="Rechercher un médicament..." className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-rose-500 font-bold" />
                    {restrictionSearch && filteredMeds.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-auto">
                        {filteredMeds.slice(0, 8).map(m => (
                          <div key={m.id} className="border-b border-slate-50 last:border-0 p-2">
                            <p className="text-xs font-bold text-slate-700">{m.name} {m.form && <span className="text-[10px] text-slate-400 font-normal">{m.form}</span>}</p>
                            {m.classe && <p className="text-[9px] text-slate-400 font-medium">{m.classe}</p>}
                            <div className="flex gap-1 mt-1">
                              <button type="button" onClick={() => addMedicationRestriction(m, 'allergy')} className="flex-1 px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded bg-red-100 text-red-700 hover:bg-red-200 transition-colors">Allergie</button>
                              <button type="button" onClick={() => addMedicationRestriction(m, 'contraindication')} className="flex-1 px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded bg-purple-100 text-purple-700 hover:bg-purple-200 transition-colors">Contre-indication</button>
                              {m.classe && <button type="button" onClick={() => addClassRestriction(m)} className="flex-1 px-2 py-1 text-[9px] font-black uppercase tracking-wider rounded bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors">Classe</button>}
                            </div>
                          </div>
                        ))}
                        {filteredMeds.length > 8 && <p className="px-3 py-1.5 text-[9px] text-slate-400 italic text-center">{filteredMeds.length - 8} autres résultats...</p>}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input type="text" value={intoleranceInput} onChange={e => setIntoleranceInput(e.target.value)} placeholder="Ex: injectables, comprimés..." className="flex-1 px-3 py-1.5 bg-white rounded-lg border border-slate-300 text-xs outline-none focus:ring-2 focus:ring-rose-500 font-bold" />
                    <button type="button" onClick={addIntoleranceRestriction} className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-[10px] font-black uppercase tracking-wider hover:bg-rose-200 transition-colors shrink-0">Ajouter</button>
                  </div>
                  {restrictions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {restrictions.map((r, i) => {
                        const typeStyle = r.type === 'allergy' ? 'bg-red-50 border-red-200 text-red-700' :
                          r.type === 'contraindication' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                          r.type === 'class' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                          'bg-amber-50 border-amber-200 text-amber-700';
                        const typeDot = r.type === 'allergy' ? 'bg-red-500' :
                          r.type === 'contraindication' ? 'bg-purple-500' :
                          r.type === 'class' ? 'bg-orange-500' : 'bg-amber-500';
                        const typeLabel = r.type === 'allergy' ? 'Allergie' :
                          r.type === 'contraindication' ? 'Contre-indication' :
                          r.type === 'class' ? 'Classe' : 'Intolérance';
                        return (
                        <div key={i} className={cn("flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-bold border", typeStyle)}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeDot)} />
                            <span>{r.medicationName}</span>
                            <span className="text-[9px] opacity-70">({typeLabel})</span>
                          </div>
                          <button type="button" onClick={() => removeRestriction(i)} className="opacity-50 hover:opacity-100 transition-opacity"><X size={12} /></button>
                        </div>
                      );})}
                    </div>
                  )}
                </div>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Traitements Chroniques</label>
                <textarea rows={3} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData?.chronic_treatments || ''} onChange={e => setFormData({ ...formData, chronic_treatments: e.target.value })} placeholder="Liste des médicaments pris au long cours..." />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Hospitalisations</label>
                <textarea rows={3} className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData?.hospitalizations || ''} onChange={e => setFormData({ ...formData, hospitalizations: e.target.value })} placeholder="Historique des séjours hospitaliers..." />
             </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-50">
             <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs">Annuler</button>
             <button type="submit" className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-blue-100">Enregistrer Dossier</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function MedicalReportForm({ patientId, onCancel, onSuccess }: { patientId: number, onCancel: () => void, onSuccess: () => void }) {
  const [formData, setFormData] = useState<Partial<MedicalReport>>({
    patient_id: patientId,
    type: 'certificate',
    date: format(new Date(), "yyyy-MM-dd"),
    content: ''
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.createMedicalReport(formData);
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  const templates: Record<string, string> = {
    certificate: "Je soussigné Dr. X, certifie que l'état de santé de M./Mme [Nom] ne présente pas de contre-indication à [Activité].",
    orientation: "M./Mme [Nom] est adressé(e) à votre consultation pour [Motif]. Merci de votre prise en charge.",
    sick_leave: "Je soussigné Dr. X, certifie avoir examiné M./Mme [Nom] et que son état de santé nécessite un arrêt de travail de [Nombre] jours à compter du [Date].",
    report: "Compte-rendu médical détaillant l'évolution clinique et les examens pratiqués pour M./Mme [Nom]..."
  };

  const handleTypeChange = (type: string) => {
    setFormData({ ...formData, type, content: templates[type] || '' });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-2xl">
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-8 tracking-tighter">Créer Document Administratif</h3>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Type de Document</label>
                <select className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700" value={formData.type} onChange={e => handleTypeChange(e.target.value)}>
                   <option value="certificate">Certificat Médical</option>
                   <option value="sick_leave">Arrêt de Travail</option>
                   <option value="orientation">Lettre d'Orientation / Transfert</option>
                   <option value="report">Compte-rendu Médical</option>
                </select>
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Date</label>
                <input type="date" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
             </div>
          </div>
          <div>
             <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Contenu / Corps du texte</label>
             <textarea rows={8} className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium leading-relaxed" value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
             <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs">Annuler</button>
             <button type="submit" className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-blue-100">Générer & Enregistrer</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function SharePatientModal({ patientId, onClose }: { patientId: number, onClose: () => void }) {
  const [doctors, setDoctors] = useState<User[]>([]);
  const [sharedWith, setSharedWith] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<SharePermission[]>([]);
  const [transferredDoctors, setTransferredDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<User | null>(null);
  const [sharePerms, setSharePerms] = useState({
    can_view_medical_history: true,
    can_view_consultations: true,
    can_view_exams: true,
    can_view_reports: true,
    can_view_documents: true,
  });
  const [sharePriority, setSharePriority] = useState('normal');
  const [shareReason, setShareReason] = useState('');
  const [editingPerms, setEditingPerms] = useState<{ doctorId: number, perms: typeof sharePerms } | null>(null);

  const handleUnshare = async (doctorId: number) => {
    if (!confirm("Retirer l'accès à ce médecin ?")) return;
    try {
      await api.unsharePatient(patientId, doctorId);
      await loadData();
    } catch (err) {
      alert("Erreur lors du retrait du partage");
    }
  };

  const handleTransfer = async (doctorId: number, force = false) => {
    if (!force && !confirm("Transférer définitivement le dossier ? Le médecin conservera une copie indépendante même si vous supprimez le patient.")) return;
    try {
      const res = await api.transferPatient(patientId, doctorId, force);
      if (res.hasBeenTransferred) {
        if (confirm(`⚠️ Ce dossier a déjà été transféré à ce médecin.\n\n${res.message}\n\nCliquez OK pour créer une nouvelle copie, ou Annuler.`)) {
          await handleTransfer(doctorId, true);
        }
        return;
      }
      await loadData();
    } catch (err: any) {
      alert("Erreur lors du transfert : " + (err?.message || err));
    }
  };

  useEffect(() => {
    loadData();
  }, [patientId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allDocs, shared, permsData, transferred] = await Promise.all([
        api.getDoctors(),
        api.getSharedWith(patientId),
        api.getSharePermissions(patientId),
        api.getTransferredDoctors(patientId)
      ]);
      setDoctors(allDocs || []);
      setSharedWith(shared || []);
      setPermissions(permsData || []);
      setTransferredDoctors(transferred || []);
    } catch (err) {
      console.error("Failed to load sharing metadata", err);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!selectedDoctor) return;
    setIsSharing(true);
    try {
      await api.sharePatient(patientId, selectedDoctor.id, sharePerms, sharePriority, shareReason);
      setSelectedDoctor(null);
      setSharePerms({ can_view_medical_history: true, can_view_consultations: true, can_view_exams: true, can_view_reports: true, can_view_documents: true });
      setSharePriority('normal');
      setShareReason('');
      await loadData();
    } catch (err) {
      alert("Erreur lors du partage: " + ((err as any)?.message || err));
    } finally {
      setIsSharing(false);
    }
  };

  const handleUpdatePerms = async () => {
    if (!editingPerms) return;
    try {
      await api.updateSharePermission(patientId, editingPerms.doctorId, editingPerms.perms);
      setEditingPerms(null);
      await loadData();
    } catch (err) {
      alert("Erreur lors de la mise à jour");
    }
  };

  const filteredDoctors = doctors.filter(d =>
    !sharedWith.some(s => s.id === d.id) &&
    !transferredDoctors.some(t => t.id === d.id) &&
    (d.full_name.toLowerCase().includes(search.toLowerCase()) ||
     d.specialty?.toLowerCase().includes(search.toLowerCase()))
  );

  const PermCheckbox = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
      <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{label}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[70] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden"
      >
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
          <div>
            <h3 className="text-2xl font-black text-indigo-900 tracking-tighter uppercase">Partage de Dossier</h3>
            <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest mt-1">Personnalisez l'accès au dossier patient</p>
          </div>
          <button onClick={onClose} className="p-3 bg-white text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
            <X size={24} />
          </button>
        </div>

        <div className="p-8 space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Shared List with permissions */}
          {permissions.length > 0 && (
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Accès partagé avec ({permissions.length})</h4>
              <div className="space-y-4">
                {permissions.map(p => (
                  <div key={p.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 font-black">
                          {(p.doctor_full_name || '?').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase">{p.doctor_full_name || 'Médecin'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{p.specialty || 'Médecin'}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-[10px] font-black uppercase tracking-widest">Actif</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500">
                      <span className={p.can_view_medical_history ? 'text-emerald-600' : 'text-red-400'}>
                        {p.can_view_medical_history ? '✓' : '✗'} Dossier permanent
                      </span>
                      <span className={p.can_view_consultations ? 'text-emerald-600' : 'text-red-400'}>
                        {p.can_view_consultations ? '✓' : '✗'} Consultations
                      </span>
                      <span className={p.can_view_exams ? 'text-emerald-600' : 'text-red-400'}>
                        {p.can_view_exams ? '✓' : '✗'} Para-clinique
                      </span>
                      <span className={p.can_view_documents ? 'text-emerald-600' : 'text-red-400'}>
                        {p.can_view_documents ? '✓' : '✗'} Documents
                      </span>
                    </div>
                    {p.share_reason && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Motif du partage</p>
                        <p className="text-xs text-slate-600 italic mt-0.5">"{p.share_reason}"</p>
                      </div>
                    )}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
                      <button onClick={() => handleUnshare(p.doctor_id)} className="flex-1 py-2 rounded-xl bg-red-50 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all">
                        Retirer l'accès
                      </button>
                      <button onClick={() => handleTransfer(p.doctor_id)} className="flex-1 py-2 rounded-xl bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all">
                        Transférer définitivement
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transferred List */}
          {transferredDoctors.length > 0 && (
            <div>
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Dossiers transférés ({transferredDoctors.length})</h4>
              <div className="space-y-3">
                {transferredDoctors.map(t => (
                  <div key={t.id} className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-200 rounded-xl flex items-center justify-center text-amber-700 font-black">
                          {(t.full_name || '?').charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase">{t.full_name || 'Médecin'}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{t.specialty || 'Médecin'}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest">Transféré</span>
                    </div>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-amber-200">
                      <button onClick={() => handleTransfer(t.doctor_id, true)} className="flex-1 py-2 rounded-xl bg-amber-100 text-amber-700 text-[10px] font-black uppercase tracking-widest hover:bg-amber-200 transition-all">
                        Retransférer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Select Doctor */}
          {!selectedDoctor && !editingPerms && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Search size={14} className="text-indigo-500" />
                Rechercher un médecin à ajouter
              </h4>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Nom ou spécialité..."
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-[240px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {loading ? (
                  <div className="text-center py-8 text-slate-400 animate-pulse uppercase font-black text-[10px]">Chargement...</div>
                ) : filteredDoctors.length > 0 ? (
                  filteredDoctors.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoctor(doc)}
                      className="w-full group flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50/20 transition-all text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 font-black">
                          {doc.full_name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800 uppercase">{doc.full_name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{doc.specialty} • {doc.city}</p>
                        </div>
                      </div>
                      <PlusCircle size={24} className="text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-400 font-medium italic text-xs">
                    {search ? 'Aucun médecin trouvé' : 'Commencez à taper...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Permissions Form for new share */}
          {selectedDoctor && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-indigo-50 rounded-2xl">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-lg">
                  {selectedDoctor.full_name.charAt(0)}
                </div>
                <div>
                  <p className="font-black text-indigo-900 uppercase">{selectedDoctor.full_name}</p>
                  <p className="text-xs text-indigo-600 font-bold">{selectedDoctor.specialty} • {selectedDoctor.city}</p>
                </div>
              </div>

              <div>
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Autorisations d'accès</h5>
                <div className="grid grid-cols-2 gap-2 bg-white border border-slate-100 rounded-2xl p-4">
                  <PermCheckbox label="Dossier Permanent" checked={sharePerms.can_view_medical_history} onChange={v => setSharePerms(p => ({...p, can_view_medical_history: v}))} />
                  <PermCheckbox label="Consultations" checked={sharePerms.can_view_consultations} onChange={v => setSharePerms(p => ({...p, can_view_consultations: v}))} />
                  <PermCheckbox label="Examens Para-cliniques" checked={sharePerms.can_view_exams} onChange={v => setSharePerms(p => ({...p, can_view_exams: v}))} />
                  <PermCheckbox label="Documents" checked={sharePerms.can_view_documents} onChange={v => setSharePerms(p => ({...p, can_view_documents: v}))} />
                </div>
              </div>

              <div>
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Motif du partage</h5>
                <textarea
                  placeholder="Lettre de partage au confrère..."
                  rows={3}
                  className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-700 italic resize-none"
                  value={shareReason}
                  onChange={e => setShareReason(e.target.value)}
                />
              </div>

              <div>
                <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Priorité de partage</h5>
                <div className="flex gap-3">
                  <button onClick={() => setSharePriority('normal')} className={cn("flex-1 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border-2", sharePriority === 'normal' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}>
                    📋 Normal
                  </button>
                  <button onClick={() => setSharePriority('urgent')} className={cn("flex-1 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border-2", sharePriority === 'urgent' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}>
                    🔴 Urgent
                  </button>
                  <button onClick={() => setSharePriority('very_urgent')} className={cn("flex-1 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border-2", sharePriority === 'very_urgent' ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}>
                    ⛔ Très urgent
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setSelectedDoctor(null)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all">Annuler</button>
                <button onClick={handleShare} disabled={isSharing} className="flex-1 py-3 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                  {isSharing ? "..." : "Partager le dossier"}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function DiscussionTab({ patientId, messages, onSend, currentUserId }: { patientId: number, messages: any[], onSend: () => void, currentUserId: number }) {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [recipientId, setRecipientId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.getDoctors().then(d => setDoctors(d.filter((doc: any) => doc.id !== currentUserId))).catch(() => {});
  }, [currentUserId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientId || !message.trim()) return;
    setSending(true);
    try {
      await api.sendMedicalMessage({ recipient_id: recipientId, patient_id: patientId, subject: subject || "Discussion clinique", message });
      setRecipientId(null);
      setSubject("");
      setMessage("");
      onSend();
    } catch (err) {
      alert("Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tighter mb-6 flex items-center gap-2">
          <MessageCircle size={20} className="text-blue-600" />
          Discussion médicale
        </h4>
        {messages.length === 0 ? (
          <div className="text-center py-12 text-slate-400 italic text-xs uppercase tracking-widest">Aucune discussion pour ce patient</div>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
            {messages.map((m: any) => {
              const isMine = m.sender_id === currentUserId;
              return (
                <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-4 rounded-2xl ${isMine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isMine ? 'text-blue-200' : 'text-slate-400'}`}>
                        {isMine ? 'Vous' : m.sender_name}
                      </span>
                      <span className={`text-[10px] ${isMine ? 'text-blue-300' : 'text-slate-300'}`}>
                        {format(new Date(m.created_at), "dd/MM HH:mm")}
                      </span>
                    </div>
                    {m.subject && <p className={`text-[10px] font-bold mb-1 ${isMine ? 'text-blue-200' : 'text-slate-500'}`}>{m.subject}</p>}
                    <p className="text-sm">{m.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
        <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Nouveau message</h5>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Destinataire</label>
            <select
              className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
              value={recipientId || ''}
              onChange={e => setRecipientId(parseInt(e.target.value) || null)}
              required
            >
              <option value="">Sélectionner un médecin...</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>{d.full_name} - {d.specialty}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Sujet (optionnel)</label>
            <input type="text" className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Discussion clinique" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Message</label>
            <textarea rows={3} className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border-none text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={message} onChange={e => setMessage(e.target.value)} placeholder="Écrivez votre message..." required />
          </div>
          <button type="submit" disabled={sending || !recipientId || !message.trim()} className="px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50">
            {sending ? "..." : "Envoyer"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PatientDetail({ id, onBack, user, pendingAppointmentId, onClearPendingAppointment, pendingAppointmentReason }: { id: number, onBack: () => void, user: User, pendingAppointmentId?: number | null, onClearPendingAppointment?: () => void, pendingAppointmentReason?: string }) {
  const { t } = useTranslation();
  const [patient, setPatient] = useState<(Patient & { consultations: Consultation[], appointments: Appointment[], exams: MedicalExam[], reports: MedicalReport[] }) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [showConsultForm, setShowConsultForm] = useState(false);
  const [editingConsult, setEditingConsult] = useState<Consultation | null>(null);
  const [showExamForm, setShowExamForm] = useState(false);
  const [editingExam, setEditingExam] = useState<MedicalExam | null>(null);

  const [showHistoryForm, setShowHistoryForm] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [showPatientEditForm, setShowPatientEditForm] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [patientLabRequests, setPatientLabRequests] = useState<any[]>([]);
  const [laboratories, setLaboratories] = useState<any[]>([]);
  const [imagingCenters, setImagingCenters] = useState<any[]>([]);
  const [showPrescribeForm, setShowPrescribeForm] = useState(false);
  const [showLabForm, setShowLabForm] = useState(false);
  const [reportingLabId, setReportingLabId] = useState<number | null>(null);
  const [reportText, setReportText] = useState("");
  const [reportIndication, setReportIndication] = useState("");
  const [reportProvider, setReportProvider] = useState("");
  const [reportResult, setReportResult] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [resendProviderId, setResendProviderId] = useState<number | "">("");

  const [activeTab, setActiveTab] = useState<'clinical' | 'history' | 'exams' | 'reports' | 'discussion'>('clinical');
  const prescriptionStatusMap: Map<string, string> = new Map(prescriptions.filter(p => p.prescription_code).map(p => [p.prescription_code!, p.status]));

  useEffect(() => {
    loadPatient();
    const timer = setTimeout(() => setLoadingTimeout(true), 15000);
    return () => clearTimeout(timer);
  }, [id]);

  const loadPatient = async () => {
    setLoadError(null);
    setPatient(null);
    setLoadingTimeout(false);
    try {
      const data = await api.getPatient(id);
      setPatient(data);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Forbidden')) {
        setLoadError("Accès refusé : ce dossier ne vous a pas été partagé.");
      } else if (msg.includes('Patient not found') || msg.includes('404')) {
        setLoadError("Patient introuvable. Le dossier a peut-être été supprimé ou n'est pas encore synchronisé.");
      } else {
        setLoadError("Impossible de charger le dossier patient. Vérifiez votre connexion à la base de données.");
      }
    }
  };

  const loadPrescriptions = async () => {
    try {
      const data = await api.getPatientPrescriptions(id);
      setPrescriptions(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadMessages = async () => {
    try {
      const data = await api.getPatientMessages(id);
      setMessages(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPatientLabRequests = async () => {
    try {
      const reqs = await api.getLabRequests();
      setPatientLabRequests(reqs.filter((r: any) => r.patient_id === id));
    } catch (err) {
      console.error(err);
    }
  };

  const loadLaboratories = async () => {
    try {
      const [labs, ics] = await Promise.all([api.getLaboratories(), api.getImagingCenters()]);
      setLaboratories(labs);
      setImagingCenters(ics);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user.role === 'doctor') loadPrescriptions();
  }, [id, user.role]);

  useEffect(() => {
    if (user.role === 'doctor') loadMessages();
  }, [id, user.role]);

  useEffect(() => {
    if (user.role === 'doctor') {
      loadPatientLabRequests();
      loadLaboratories();
    }
  }, [id, user.role]);

  if (loadError) return (
    <div className="p-16 text-center">
      <div className="max-w-md mx-auto bg-white rounded-3xl p-8 shadow-sm border border-red-100">
        <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
        <p className="text-red-700 font-bold mb-4">{loadError}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onBack} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase tracking-widest text-xs">Retour</button>
          <button onClick={loadPatient} className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-blue-100">Réessayer</button>
        </div>
      </div>
    </div>
  );

  if (!patient) {
    if (loadingTimeout) return (
      <div className="p-16 text-center">
        <div className="max-w-md mx-auto bg-white rounded-3xl p-8 shadow-sm border border-amber-100">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <p className="text-amber-700 font-bold mb-4">Le serveur ne répond pas. Vérifiez que le backend est en cours d'exécution.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={onBack} className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold uppercase tracking-widest text-xs">Retour</button>
            <button onClick={loadPatient} className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-blue-100">Réessayer</button>
          </div>
        </div>
      </div>
    );
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 font-bold">{t("loading")}</p>
        </div>
      </div>
    );
  }

  const isSecretaryView = user.role === 'secretary';
  const canUseMedical = user.role === 'doctor';
  const latestConsult = canUseMedical ? patient.consultations?.[0] : undefined;

  const handleEditConsult = (consult: Consultation) => {
    setEditingConsult(consult);
    setShowConsultForm(true);
  };

  const handleDeleteConsult = async (consult: Consultation) => {
    if (!window.confirm('Supprimer cette consultation ? Cette action est irréversible.')) return;
    try {
      await api.deleteConsultation(consult.id);
      loadPatient();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditExam = (exam: MedicalExam) => {
    setEditingExam(exam);
    setShowExamForm(true);
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-bold uppercase tracking-wider text-xs transition-colors mb-4">
         {document.documentElement.dir === 'rtl' ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
         {t("patients")}
      </button>

      {/* Header Profile Card */}
      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8 items-start relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 opacity-50" />

        <div className="w-24 h-24 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-4xl font-black relative z-10 overflow-hidden shadow-xl shadow-blue-100">
          {patient.photo ? <img src={patient.photo} className="w-full h-full object-cover" /> : `${patient.last_name[0]}${patient.first_name[0]}`}
          <button className="absolute bottom-0 right-0 bg-white/20 backdrop-blur-md p-1 hover:bg-white/40 transition-colors">
            <Camera size={12} className="text-white" />
          </button>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">{patient.last_name} {patient.first_name}</h3>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">#{patient.id.toString().padStart(6, '0')}</span>
                <span className="text-slate-400 font-black text-[10px] uppercase tracking-widest border-l border-slate-200 pl-4">{patient.blood_group || 'Gr. Sanguin: -'}</span>
                <span className="text-emerald-500 font-black text-[10px] uppercase tracking-widest border-l border-slate-200 pl-4">{patient.profession || 'Sans Profession'}</span>
              </div>
            </div>
            <button
              onClick={() => setShowPatientEditForm(true)}
              className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all border border-transparent hover:border-blue-100"
            >
              <Edit2 size={20} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-2 border-t border-slate-50">
            <InfoItem label={t("gender")} value={t(patient.gender || 'other')} />
            <InfoItem label={t("birth_date")} value={patient.birth_date ? `${format(new Date(patient.birth_date), "dd/MM/yyyy")}${patient.age ? ` (${patient.age} ans)` : ''}` : patient.age ? `${patient.age} ans` : '-'} />
            <InfoItem label={t("phone")} value={patient.phone} isMono />
            <InfoItem label="Wilaya" value={patient.wilaya || '-'} />
          </div>

          {latestConsult && (
            <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-50">
              <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex flex-col">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Dernière TA</span>
                <span className="text-xs font-black text-slate-700">{latestConsult.bp || '-'}</span>
              </div>
              <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex flex-col">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Dernier Poids</span>
                <span className="text-xs font-black text-slate-700">{latestConsult.weight ? `${latestConsult.weight}kg` : '-'}</span>
              </div>
              <div className="bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 flex flex-col">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Dernière Glycémie</span>
                <span className="text-xs font-black text-slate-700">{latestConsult.glycemia ? `${latestConsult.glycemia}g/l` : '-'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 relative z-10">
          {canUseMedical && <button
            onClick={() => setShowConsultForm(true)}
            className="bg-blue-600 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest text-[10px]"
          >
            <Plus size={16} />
            Nouvelle Consultation
          </button>}
          {canUseMedical && <button
            onClick={() => setShowReportForm(true)}
            className="bg-slate-800 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-900 transition-all shadow-xl shadow-slate-100 uppercase tracking-widest text-[10px]"
          >
            <FilePlus size={16} />
            Rapport Administratif
          </button>}
          {canUseMedical && <button
            onClick={() => setShowShareModal(true)}
            className="bg-indigo-600 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 uppercase tracking-widest text-[10px]"
          >
            <Share2 size={16} />
            Partager Dossier
          </button>}
          {canUseMedical && <button
            onClick={() => { loadLaboratories(); setShowPrescribeForm(true); }}
            className="bg-cyan-600 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-cyan-700 transition-all shadow-xl shadow-cyan-100 uppercase tracking-widest text-[10px]"
          >
            <FlaskConical size={16} />
            Prescrire des examens
          </button>}
          {patient.access_role === 'owner' && (
            <button
              onClick={async () => {
                if (window.confirm('Supprimer ce patient et toutes ses données ? Cette action est irréversible.')) {
                  try {
                    await api.deletePatient(patient.id);
                    onBack();
                  } catch (err) {
                    alert("Erreur lors de la suppression");
                  }
                }
              }}
              className="bg-red-600 text-white px-6 py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-red-700 transition-all shadow-xl shadow-red-100 uppercase tracking-widest text-[10px]"
            >
              <Trash2 size={16} />
              Supprimer Patient
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 space-y-6">
          {canUseMedical ? (
            <div className="flex gap-1 bg-slate-100 p-1.5 rounded-3xl w-fit shadow-inner overflow-x-auto md:overflow-visible max-w-full">
              <TabButton active={activeTab === 'clinical'} onClick={() => setActiveTab('clinical')} label="Journal Clinique" />
              <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} label="Dossier Permanent" />
              <TabButton active={activeTab === 'exams'} onClick={() => setActiveTab('exams')} label="Examens paracliniques" />
              <TabButton active={activeTab === 'reports'} onClick={() => setActiveTab('reports')} label="Documents" />
              <TabButton active={activeTab === 'discussion'} onClick={() => setActiveTab('discussion')} label="Discussion" />
            </div>
          ) : (
            <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 text-sm text-blue-800 font-bold">
              Espace secrétaire médicale : seules les informations administratives du patient et les rendez-vous sont disponibles. Les consultations, ordonnances, examens et documents médicaux restent réservés au médecin.
            </div>
          )}

          {canUseMedical && <div className="space-y-4">
            {activeTab === 'clinical' && (
              (patient.consultations || []).length > 0 ? (
                (patient.consultations || []).map(c => (
                  <ConsultationCard
                    key={c.id}
                    consult={c}
                    prescriptionStatus={c.prescription_code ? prescriptionStatusMap.get(c.prescription_code) : undefined}
                    onPrint={() => generatePrescriptionPDF(patient, c, c.medications || [], user, c.prescription_code)}
                    onEdit={() => handleEditConsult(c)}
                    onDelete={patient.access_role === 'owner' ? () => handleDeleteConsult(c) : undefined}
                    patientMedicalHistory={patient.medical_history}
                  />
                ))
              ) : <div className="bg-white rounded-3xl p-16 text-center text-slate-400 italic shadow-sm border border-slate-100 uppercase tracking-widest text-[10px]">Historique clinique vierge</div>
            )}

            {activeTab === 'history' && (
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 space-y-8">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Profil Médical Permanent</h4>
                  <button onClick={() => setShowHistoryForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors">
                    <Edit2 size={16} />
                    Mettre à jour le dossier
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <HistorySection title="Maladies & Antécédents Médicaux" content={patient.medical_history?.medical} />
                  <HistorySection title="Interventions Chirurgicales" content={patient.medical_history?.surgical} />
                  <HistorySection title="Pathologies Familiales" content={patient.medical_history?.family} />
                  <HistorySection title="Allergies Connues" content={patient.medical_history?.allergies} isWarning />
                  {patient.medical_history?.medication_restrictions && patient.medical_history.medication_restrictions.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Médicaments à risques</p>
                      {patient.medical_history.medication_restrictions.map((r, i) => {
                        const typeStyle = r.type === 'allergy' ? 'bg-red-50 border-red-200 text-red-700' :
                          r.type === 'contraindication' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                          r.type === 'class' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                          'bg-amber-50 border-amber-200 text-amber-700';
                        const typeDot = r.type === 'allergy' ? 'bg-red-500' :
                          r.type === 'contraindication' ? 'bg-purple-500' :
                          r.type === 'class' ? 'bg-orange-500' : 'bg-amber-500';
                        const typeLabel = r.type === 'allergy' ? 'Allergie' :
                          r.type === 'contraindication' ? 'Contre-indication' :
                          r.type === 'class' ? 'Classe' : 'Intolérance';
                        return (
                        <div key={i} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border", typeStyle)}>
                          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeDot)} />
                          <span>{r.medicationName}</span>
                          <span className="text-[10px] opacity-70">({typeLabel})</span>
                        </div>
                      );})}
                    </div>
                  )}
                  <HistorySection title="Traitements Chroniques" content={patient.medical_history?.chronic_treatments} />
                  <HistorySection title="Hospitalisations passées" content={patient.medical_history?.hospitalizations} />
                </div>
              </div>
            )}

            {activeTab === 'exams' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-lg font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                    <FlaskConical size={20} className="text-cyan-600" />
                    Examens paracliniques
                  </h4>
                  <button
                    onClick={() => { loadLaboratories(); setShowPrescribeForm(true); }}
                    className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-700 transition-all shadow-lg shadow-cyan-100"
                  >
                    <Plus size={16} />
                    Prescrire des examens
                  </button>
                </div>

                {/* Lab / Imaging requests */}
                {patientLabRequests.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Demandes d'examens</p>
                    {patientLabRequests.map((req: any) => {
                      const reports = getReports(req);
                      const isImaging = req.exam_category === 'radiologique' || req.imaging_center_id;
                      return (
                      <div key={req.id} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              {isImaging ? "Demande d'imagerie" : "Demande d'analyse"} #{req.id} • {format(new Date(req.created_at), "dd/MM/yyyy")}
                              {req.lab_name && <span className="ml-2 text-indigo-500">→ {req.lab_name}</span>}
                              {req.imaging_center_name && <span className="ml-2 text-pink-500">→ {req.imaging_center_name}</span>}
                            </p>
                          </div>
                          <span className={cn(
                            "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest",
                            req.status === 'requested' ? "bg-amber-100 text-amber-700" : req.status === 'refused' ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                          )}>
                            {req.status === 'requested' ? 'En attente' : req.status === 'refused' ? 'Refusée' : 'Terminée'}
                          </span>
                        </div>
                        <div className="mb-3">
                          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">{isImaging ? "Examens" : "Analyses"}</p>
                          <div className="flex flex-wrap gap-2">
                            {(typeof req.requested_analyses === 'string' ? JSON.parse(req.requested_analyses) : req.requested_analyses || []).map((a: string, i: number) => (
                              <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-xs font-bold">{a}</span>
                            ))}
                          </div>
                        </div>
                        {req.status === 'refused' && req.refusal_reason && (
                          <div className="p-3 bg-red-50 rounded-2xl border border-red-100 mt-3">
                            <p className="text-[10px] font-black text-red-700 uppercase tracking-widest mb-1">Motif du refus</p>
                            <p className="text-sm text-red-800 font-bold">{req.refusal_reason}</p>
                          </div>
                        )}
                        {req.status === 'refused' && canUseMedical && (
                          <div className="mt-3">
                            {resendingId === req.id ? (
                              <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                  {isImaging ? "Notifier un centre d'imagerie" : "Notifier un laboratoire"}
                                </label>
                                <select className="w-full px-4 py-2.5 bg-white rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-cyan-500"
                                  value={resendProviderId}
                                  onChange={e => setResendProviderId(e.target.value ? parseInt(e.target.value) : "")}
                                >
                                  <option value="">Sélectionner...</option>
                                  {(isImaging ? imagingCenters : laboratories).map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.clinic_name || p.full_name}</option>
                                  ))}
                                </select>
                                <div className="flex gap-2 justify-end">
                                  <button onClick={() => { setResendingId(null); setResendProviderId(""); }} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider">Annuler</button>
                                  <button onClick={async () => {
                                    if (!resendProviderId) { alert("Veuillez sélectionner un prestataire."); return; }
                                    try {
                                      const analyses = typeof req.requested_analyses === 'string' ? JSON.parse(req.requested_analyses) : (req.requested_analyses || []);
                                      await api.createLabRequest({
                                        patient_id: patient.id,
                                        lab_id: isImaging ? undefined : resendProviderId,
                                        imaging_center_id: isImaging ? resendProviderId : undefined,
                                        requested_analyses: analyses,
                                        exam_category: isImaging ? 'radiologique' : 'biologique',
                                      });
                                      setResendingId(null);
                                      setResendProviderId("");
                                      loadPatientLabRequests();
                                    } catch (err) { alert("Erreur lors de la ré-émission"); }
                                  }} className="px-4 py-2 bg-cyan-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-100">
                                    Envoyer
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setResendingId(req.id); setResendProviderId(""); }} className="px-3 py-1.5 bg-white border border-cyan-200 text-cyan-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-cyan-50 transition-colors">
                                <Send size={12} className="inline mr-1" />Ré-émettre
                              </button>
                            )}
                          </div>
                        )}
                        {req.status !== 'refused' && (
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => { setReportingLabId(req.id); setReportText(""); setReportIndication(""); setReportProvider(""); setReportResult(""); setReportNotes(""); }}
                            className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-colors"
                          >
                            <FileSearch size={12} className="inline mr-1" />Saisir rapport
                          </button>
                          <button
                            onClick={async () => { if (confirm(isImaging ? "Supprimer cette demande d'imagerie ?" : "Supprimer cette demande d'analyse ?")) { try { await api.deleteLabRequest(req.id); loadPatientLabRequests(); } catch {} } }}
                            className="px-3 py-1.5 bg-white border border-slate-200 text-red-400 hover:text-red-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-red-50 transition-colors"
                          >
                            <X size={12} className="inline mr-1" />Supprimer
                          </button>
                        </div>
                        )}
                        {reports.length > 0 && (
                          <div className="space-y-2 mt-3">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Rapports ({reports.length})</p>
                            {reports.map((r: any, idx: number) => (
                              <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Rapport #{idx + 1}{r.created_at ? ` • ${format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}` : ''}{r.author === 'doctor' ? <span className="ml-1 text-blue-600">(Médecin)</span> : r.author === 'laboratory' ? <span className="ml-1 text-indigo-600">(Laboratoire)</span> : r.author === 'imaging_center' ? <span className="ml-1 text-pink-600">(Imagerie)</span> : ''}</p>
                                  <div className="flex items-center gap-1">
                                    {r.pdf && (
                                      <button onClick={() => viewReportPdf(req.id, idx)} className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1">
                                        <Download size={12} /> PDF
                                      </button>
                                    )}
                                    <button onClick={() => generateExamReportPDF(patient, {
                                      sub_type: (typeof req.requested_analyses === 'string' ? JSON.parse(req.requested_analyses) : req.requested_analyses || []).join(', '),
                                      date: r.created_at || req.created_at,
                                      provider: r.provider || req.lab_name || req.imaging_center_name || '',
                                      indication: r.indication || '',
                                      result: r.result || r.text || '',
                                      notes: r.notes || ''
                                    }, user)} className="text-emerald-600 hover:text-emerald-800 text-xs font-bold flex items-center gap-1">
                                      <Printer size={12} /> Imprimer
                                    </button>
                                    <button onClick={async () => { if (confirm("Supprimer ce rapport ?")) { try { await api.deleteLabReport(req.id, idx); loadPatientLabRequests(); } catch {} } }} className="text-red-400 hover:text-red-600 text-xs font-bold flex items-center gap-1">
                                      <Trash2 size={12} /> Supprimer
                                    </button>
                                  </div>
                                </div>
                                {r.indication && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 mb-0.5">Indication</p>}
                                {r.indication && <p className="text-xs text-slate-600 italic leading-relaxed">{r.indication}</p>}
                                {(r.result || r.text) && (
                                  <div className="bg-white p-3 rounded-lg border border-slate-100 mt-2">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Rapport de {r.provider || req.lab_name || req.imaging_center_name || (isImaging ? "Centre d'imagerie" : 'Laboratoire')}</p>
                                    <p className="text-sm text-slate-800 font-bold whitespace-pre-wrap">{r.result || r.text}</p>
                                  </div>
                                )}
                                {r.notes && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 mb-0.5">Notes Additionnelles</p>}
                                {r.notes && <p className="text-xs text-slate-500 italic leading-relaxed">{r.notes}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Direct medical exams */}
                {patient.exams && patient.exams.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Examens prescrits</p>
                    {patient.exams.map(exam => (
                      <MedicalExamCard key={exam.id} exam={exam} patient={patient} user={user} onEdit={() => handleEditExam(exam)} onDelete={async () => { if (confirm(`Supprimer l'examen "${exam.sub_type}" ?`)) { try { await api.deleteMedicalExam(exam.id); loadPatient(); } catch {} } }} />
                    ))}
                  </div>
                )}

                {(!patientLabRequests || patientLabRequests.length === 0) && (!patient.exams || patient.exams.length === 0) && (
                  <div className="bg-white rounded-3xl p-16 text-center text-slate-400 italic shadow-sm border border-slate-100 uppercase tracking-widest text-[10px]">
                    Aucun examen prescrit ou réalisé.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-4">
                 <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                  <h4 className="text-lg font-black text-slate-800 uppercase tracking-tighter">Documents Administratifs</h4>
                  <button
                    onClick={() => setShowReportForm(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-lg shadow-slate-100"
                  >
                    <FilePlus size={16} />
                    Générer Document
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {patient.reports && patient.reports.length > 0 ? (
                    patient.reports.map(report => (
                      <div key={report.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center hover:border-blue-200 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="bg-slate-50 p-3 rounded-xl text-slate-600">
                            <FileText size={20} />
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{report.type === 'certificate' ? 'Certificat' : report.type === 'sick_leave' ? 'Arrêt de travail' : report.type === 'orientation' ? 'Orientation' : 'Compte-rendu'}</p>
                            <p className="text-sm font-black text-slate-800 uppercase">{format(new Date(report.date), "dd/MM/yyyy")}</p>
                            {report.doctor_name && <p className="text-[10px] text-slate-400 font-bold">par {report.doctor_name}</p>}
                          </div>
                        </div>
                        <button
                          onClick={() => generateReportPDF(patient, report)}
                          className="text-blue-600 hover:text-blue-800 p-2"
                        >
                           <Printer size={20} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="md:col-span-2 bg-white rounded-3xl p-16 text-center text-slate-400 italic shadow-sm border border-slate-100 uppercase tracking-widest text-[10px]">
                      Aucun document généré.
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'discussion' && (
              <DiscussionTab
                patientId={id}
                messages={messages}
                onSend={() => loadMessages()}
                currentUserId={user.id}
              />
            )}

          </div>}
        </div>

        {canUseMedical && <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
               <div className="flex items-center gap-2">
                 <TrendingUp size={18} className="text-blue-600" />
                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Evolution des Paramètres</h4>
               </div>
            </div>

            <div className="space-y-6">
              {/* Weight Graph */}
              <div className="h-[80px] w-full">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Poids (kg)</span>
                  <span className="text-xs font-black text-blue-600">{(patient.consultations || [])[0]?.weight ? `${(patient.consultations || [])[0].weight}kg` : '--'}</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...(patient.consultations || [])].filter(c => c.weight).reverse()}>
                    <defs>
                      <linearGradient id="colorWeightDetail" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="weight" stroke="#3b82f6" fillOpacity={1} fill="url(#colorWeightDetail)" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Glycemia Graph */}
              <div className="h-[80px] w-full pt-2 border-t border-slate-50">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Glycémie (g/L)</span>
                  <span className="text-xs font-black text-orange-600">{(patient.consultations || [])[0]?.glycemia ? `${(patient.consultations || [])[0].glycemia}g/L` : '--'}</span>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...(patient.consultations || [])].filter(c => c.glycemia).reverse()}>
                    <defs>
                      <linearGradient id="colorGlyDetail" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="glycemia" stroke="#f59e0b" fillOpacity={1} fill="url(#colorGlyDetail)" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* TA (BP) Graph - simplified as a line for better fit */}
              <div className="h-[80px] w-full pt-2 border-t border-slate-50">
                <div className="flex justify-between items-center mb-2">
                   <span className="text-[10px] font-black text-slate-400 uppercase">Tension Artérielle</span>
                   <span className="text-xs font-black text-emerald-600">{(patient.consultations || [])[0]?.bp || '--'}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <VitalItem label="T°" value={(patient.consultations || [])[0]?.temperature ? `${(patient.consultations || [])[0].temperature}°C` : '--'} color="orange" />
                  <VitalItem label="IMC" value={(patient.consultations || [])[0]?.imc?.toFixed(1) || '--'} color="indigo" />
                  <VitalItem label="SAT" value={(patient.consultations || [])[0]?.saturation ? `${(patient.consultations || [])[0].saturation}%` : '--'} color="blue" />
                </div>
              </div>
            </div>
          </div>


          <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-6 rounded-3xl shadow-xl shadow-blue-100 text-white">
             <div className="flex items-center gap-2 mb-4">
                <ShieldCheck size={20} />
                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-80">Rappel Administratif</h4>
             </div>
             <div className="space-y-4">
                <div>
                   <p className="text-[10px] font-bold uppercase opacity-60">N° Sécurité Sociale</p>
                   <p className="text-sm font-mono font-bold">{patient.nss || 'Non renseigné'}</p>
                </div>
                <div>
                   <p className="text-[10px] font-bold uppercase opacity-60">Assurance / Mutuelle</p>
                   <p className="text-sm font-bold">{patient.insurance || 'Non renseignée'}</p>
                </div>
                <div className="pt-4 border-t border-white/10">
                   <p className="text-[10px] font-bold uppercase opacity-60">Contact d'urgence</p>
                   <p className="text-xs font-medium leading-relaxed mt-1 italic">{patient.emergency_contact || 'Aucun contact enregistré'}</p>
                </div>
             </div>
          </div>
        </div>}
      </div>

      <AnimatePresence>
        {canUseMedical && showConsultForm && (
            <ConsultationForm
               patientId={patient.id}
               initialData={editingConsult || undefined}
               onCancel={() => { setShowConsultForm(false); setEditingConsult(null); if (onClearPendingAppointment) onClearPendingAppointment(); }}
               onSuccess={() => { loadPatient(); setShowConsultForm(false); setEditingConsult(null); if (onClearPendingAppointment) onClearPendingAppointment(); }}
               isShared={(patient as any).access_role === 'shared'}
               appointmentId={pendingAppointmentId}
               appointmentReason={pendingAppointmentReason}
               patientMedicalHistory={patient.medical_history}
            />
        )}
        {canUseMedical && showExamForm && (
          <MedicalExamForm
            patientId={patient.id}
            initialData={editingExam || undefined}
            onCancel={() => { setShowExamForm(false); setEditingExam(null); }}
            onSuccess={() => { loadPatient(); setShowExamForm(false); setEditingExam(null); }}
          />
        )}
        {canUseMedical && showHistoryForm && (
          <MedicalHistoryForm
            patientId={patient.id}
            initialData={patient.medical_history}
            onCancel={() => setShowHistoryForm(false)}
            onSuccess={() => { loadPatient(); setShowHistoryForm(false); }}
          />
        )}
        {canUseMedical && showReportForm && (
          <MedicalReportForm
            patientId={patient.id}
            onCancel={() => setShowReportForm(false)}
            onSuccess={() => { loadPatient(); setShowReportForm(false); }}
          />
        )}
        {canUseMedical && showShareModal && (
          <SharePatientModal
            patientId={patient.id}
            onClose={() => setShowShareModal(false)}
          />
        )}
        {showPatientEditForm && (
           <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] overflow-y-auto p-4">
              <PatientForm
                initialData={patient}
                onCancel={() => setShowPatientEditForm(false)}
                onSuccess={() => { loadPatient(); setShowPatientEditForm(false); }}
              />
           </div>
        )}
        {canUseMedical && showPrescribeForm && (
          <ExamPrescriptionForm
            patientId={patient.id}
            laboratories={laboratories}
            imagingCenters={imagingCenters}
            onCancel={() => setShowPrescribeForm(false)}
            onSuccess={() => { setShowPrescribeForm(false); loadPatient(); loadPatientLabRequests(); }}
          />
        )}
        {canUseMedical && showLabForm && (
          <LabRequestForm
            patientId={patient.id}
            laboratories={laboratories}
            onCancel={() => setShowLabForm(false)}
            onSuccess={() => { setShowLabForm(false); loadPatientLabRequests(); }}
          />
        )}
        {canUseMedical && reportingLabId !== null && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                  <FileSearch size={20} className="text-blue-600" />
                  Saisir un rapport
                </h3>
                <button onClick={() => setReportingLabId(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Indication Médicale</label>
                  <textarea
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none resize-none text-slate-700 italic"
                    placeholder="Pourquoi cet examen est-il demandé ?"
                    value={reportIndication}
                    onChange={e => setReportIndication(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Laboratoire / Centre d'imagerie</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none text-slate-700 font-medium"
                    value={reportProvider}
                    onChange={e => setReportProvider(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Résultats / Rapport</label>
                  <textarea
                    rows={4}
                    className="w-full px-4 py-2.5 bg-emerald-50/30 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border border-emerald-100 text-slate-700 font-medium"
                    placeholder="Saisissez ici les valeurs ou le compte-rendu de l'examen..."
                    value={reportResult}
                    onChange={e => setReportResult(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notes complémentaires</label>
                  <textarea
                    rows={2}
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none resize-none text-slate-700 italic"
                    value={reportNotes}
                    onChange={e => setReportNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setReportingLabId(null)} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs">Annuler</button>
                <button onClick={async () => {
                  if (!reportResult.trim() && !reportNotes.trim()) return;
                  try {
                    await api.updateLabReport(reportingLabId, { indication: reportIndication.trim(), provider: reportProvider.trim(), result: reportResult.trim(), notes: reportNotes.trim() });
                    setReportingLabId(null);
                    setReportIndication("");
                    setReportProvider("");
                    setReportResult("");
                    setReportNotes("");
                    loadPatientLabRequests();
                  } catch (err) {
                    console.error(err);
                    alert("Erreur lors de l'enregistrement du rapport");
                  }
                }} className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-blue-100">
                  Enregistrer
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

const COMMON_ANALYSES = [
  "NFS (Numération Formule Sanguine)",
  "VS (Vitesse de Sédimentation)",
  "CRP (Protéine C Réactive)",
  "Glycémie à jeun",
  "HbA1c (Hémoglobine Glyquée)",
  "Bilan lipidique (Cholestérol, Triglycérides)",
  "Bilan hépatique (Transaminases, Bilirubine)",
  "Bilan rénal (Urée, Créatinine)",
  "Ionogramme sanguin (Na+, K+, Cl-)",
  "Calcémie",
  "Ferritine",
  "TSH (Thyroïde)",
  "TP/INR (Hémostase)",
  "ECBU (Examen Cytobactériologique des Urines)",
  "Selles (Parasitologie, Coproculture)",
  "Sérologies (VIH, VHB, VHC, Syphilis)",
  "Groupage sanguin (ABO, Rhésus)",
  "Hémocultures",
  "Protéines urinaires (24h)",
  "Test de grossesse (ß-HCG)",
  "PSA (Prostate)",
  "Vitamine D"
];

function LabRequestForm({ patientId, laboratories, onCancel, onSuccess }: { patientId: number, laboratories: any[], onCancel: () => void, onSuccess: () => void }) {
  const [selectedAnalyses, setSelectedAnalyses] = useState<string[]>([]);
  const [customAnalysis, setCustomAnalysis] = useState("");
  const [selectedLabId, setSelectedLabId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [labAnalyses, setLabAnalyses] = useState<SimpleListItem[]>([]);

  useEffect(() => {
    api.getLabAnalyses().then(setLabAnalyses).catch(console.error);
  }, []);

  const analysisList = labAnalyses.length > 0 ? labAnalyses.map(a => a.name) : COMMON_ANALYSES;

  const toggleAnalysis = (analysis: string) => {
    setSelectedAnalyses(prev =>
      prev.includes(analysis) ? prev.filter(a => a !== analysis) : [...prev, analysis]
    );
  };

  const addCustomAnalysis = () => {
    const trimmed = customAnalysis.trim();
    if (trimmed && !selectedAnalyses.includes(trimmed)) {
      setSelectedAnalyses(prev => [...prev, trimmed]);
      setCustomAnalysis("");
    }
  };

  const handleSubmit = async () => {
    if (selectedAnalyses.length === 0) {
      alert("Veuillez sélectionner au moins une analyse.");
      return;
    }
    if (!selectedLabId) {
      alert("Veuillez sélectionner un laboratoire.");
      return;
    }
    setSubmitting(true);
    try {
      await api.createLabRequest({
        patient_id: patientId,
        lab_id: selectedLabId,
        requested_analyses: selectedAnalyses,
      });
      onSuccess();
    } catch (err) {
      alert("Erreur lors de l'envoi de la demande");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-6 flex items-center gap-3">
          <FlaskConical size={24} className="text-cyan-600" />
          Demander des Analyses
        </h3>

        <div className="mb-6">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Laboratoire destinataire</label>
          <select
            className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-cyan-500"
            value={selectedLabId}
            onChange={e => setSelectedLabId(e.target.value ? parseInt(e.target.value) : "")}
          >
            <option value="">Sélectionner un laboratoire</option>
            {laboratories.map(lab => (
              <option key={lab.id} value={lab.id}>{lab.clinic_name || lab.full_name}</option>
            ))}
          </select>
          {laboratories.length === 0 && (
            <p className="text-[10px] text-amber-600 font-bold mt-1">Aucun laboratoire disponible dans le système.</p>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Analyses à demander</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
            {analysisList.map(analysis => (
              <label
                key={analysis}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                  selectedAnalyses.includes(analysis)
                    ? "bg-cyan-50 border-cyan-200 text-cyan-800"
                    : "bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200"
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedAnalyses.includes(analysis)}
                  onChange={() => toggleAnalysis(analysis)}
                  className="w-4 h-4 text-cyan-600 rounded border-slate-300 focus:ring-cyan-500"
                />
                <span className="text-xs font-bold leading-tight">{analysis}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Analyse personnalisée</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nom de l'analyse..."
              className="flex-1 px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-cyan-500"
              value={customAnalysis}
              onChange={e => setCustomAnalysis(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomAnalysis(); } }}
            />
            <button
              onClick={addCustomAnalysis}
              className="px-4 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-cyan-700 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          {selectedAnalyses.filter(a => !analysisList.includes(a)).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedAnalyses.filter(a => !analysisList.includes(a)).map(a => (
                <span key={a} className="px-3 py-1.5 bg-cyan-50 text-cyan-700 rounded-xl text-xs font-bold flex items-center gap-2">
                  {a}
                  <button onClick={() => toggleAnalysis(a)} className="text-cyan-400 hover:text-cyan-700"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500 font-bold">
            {selectedAnalyses.length > 0 ? `${selectedAnalyses.length} analyse${selectedAnalyses.length > 1 ? 's' : ''} sélectionnée${selectedAnalyses.length > 1 ? 's' : ''}` : 'Aucune analyse sélectionnée'}
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs">Annuler</button>
            <button onClick={handleSubmit} disabled={submitting} className="px-8 py-3 rounded-xl font-bold bg-cyan-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-cyan-100">
              {submitting ? "..." : "Envoyer la demande"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ExamPrescriptionForm({ patientId, laboratories, imagingCenters, onCancel, onSuccess }: { patientId: number, laboratories: any[], imagingCenters: any[], onCancel: () => void, onSuccess: () => void }) {
  const [activeTab, setActiveTab] = useState<'biologie' | 'radiologie'>('biologie');
  const [selectedBioExams, setSelectedBioExams] = useState<string[]>([]);
  const [selectedImagingExams, setSelectedImagingExams] = useState<string[]>([]);
  const [customExam, setCustomExam] = useState("");
  const [selectedLabId, setSelectedLabId] = useState<number | "">("");
  const [selectedImagingCenterId, setSelectedImagingCenterId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [examLibrary, setExamLibrary] = useState<ParaclinicalExam[]>([]);
  const [prescriptionIndication, setPrescriptionIndication] = useState("");
  const [searchBio, setSearchBio] = useState("");
  const [searchImaging, setSearchImaging] = useState("");

  useEffect(() => {
    api.getParaclinicalExams().then(setExamLibrary).catch(console.error);
  }, []);

  const biologyExams = examLibrary.filter(e => e.type === 'Biologie' || e.type === 'analysis');
  const imagingExams = examLibrary.filter(e => e.type === 'Radiologie' || e.type === 'imaging');

  const filteredBio = biologyExams.filter(e => e.name.toLowerCase().includes(searchBio.toLowerCase()));
  const filteredImaging = imagingExams.filter(e => e.name.toLowerCase().includes(searchImaging.toLowerCase()));

  const toggleBioExam = (exam: string) => {
    setSelectedBioExams(prev =>
      prev.includes(exam) ? prev.filter(e => e !== exam) : [...prev, exam]
    );
  };

  const toggleImagingExam = (exam: string) => {
    setSelectedImagingExams(prev =>
      prev.includes(exam) ? prev.filter(e => e !== exam) : [...prev, exam]
    );
  };

  const addCustomExam = () => {
    const trimmed = customExam.trim();
    if (!trimmed) return;
    if (activeTab === 'biologie' && !selectedBioExams.includes(trimmed)) {
      setSelectedBioExams(prev => [...prev, trimmed]);
    } else if (activeTab === 'radiologie' && !selectedImagingExams.includes(trimmed)) {
      setSelectedImagingExams(prev => [...prev, trimmed]);
    }
    setCustomExam("");
  };

  const handleSubmit = async () => {
    if (selectedBioExams.length === 0 && selectedImagingExams.length === 0) {
      alert("Veuillez sélectionner au moins un examen.");
      return;
    }
    setSubmitting(true);
    try {
      const indication = prescriptionIndication;
      // Biological exams
      if (selectedBioExams.length > 0) {
        if (selectedLabId) {
          await api.createLabRequest({
            patient_id: patientId,
            lab_id: selectedLabId,
            requested_analyses: selectedBioExams,
            exam_category: 'biologique',
          });
        } else {
          for (const examName of selectedBioExams) {
            await api.createMedicalExam({
              patient_id: patientId,
              type: 'analysis',
              sub_type: examName,
              indication,
              date: format(new Date(), "yyyy-MM-dd"),
            });
          }
        }
      }
      // Imaging exams
      if (selectedImagingExams.length > 0) {
        if (selectedImagingCenterId) {
          await api.createLabRequest({
            patient_id: patientId,
            imaging_center_id: selectedImagingCenterId,
            requested_analyses: selectedImagingExams,
            exam_category: 'radiologique',
          });
        } else {
          for (const examName of selectedImagingExams) {
            await api.createMedicalExam({
              patient_id: patientId,
              type: 'imaging',
              sub_type: examName,
              indication,
              date: format(new Date(), "yyyy-MM-dd"),
            });
          }
        }
      }
      onSuccess();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la prescription");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSelected = selectedBioExams.length + selectedImagingExams.length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
            <FlaskConical size={24} className="text-cyan-600" />
            Prescrire des examens
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Indication Médicale</label>
            <textarea
              rows={2}
              className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-cyan-500 border-none resize-none text-slate-700 italic"
              placeholder="Pourquoi cet examen est-il demandé ?"
              value={prescriptionIndication}
              onChange={e => setPrescriptionIndication(e.target.value)}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl">
            <button
              onClick={() => setActiveTab('biologie')}
              className={cn("flex-1 py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all", activeTab === 'biologie' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              <FlaskConical size={14} className="inline mr-1.5 -mt-0.5" />
              Biologie
              {selectedBioExams.length > 0 && <span className="ml-1.5 bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full text-[10px]">{selectedBioExams.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('radiologie')}
              className={cn("flex-1 py-2.5 px-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all", activeTab === 'radiologie' ? "bg-white text-amber-700 shadow-sm" : "text-slate-500 hover:text-slate-700")}
            >
              <ImageIcon size={14} className="inline mr-1.5 -mt-0.5" />
              Radiologie
              {selectedImagingExams.length > 0 && <span className="ml-1.5 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-[10px]">{selectedImagingExams.length}</span>}
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'biologie' && (
            <div className="space-y-4">
              {/* Lab selector */}
              {laboratories.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Notifier un laboratoire <span className="text-slate-300 font-medium normal-case tracking-normal">(optionnel)</span>
                  </label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500"
                    value={selectedLabId}
                    onChange={e => setSelectedLabId(e.target.value ? parseInt(e.target.value) : "")}
                  >
                    <option value="">Prescription directe (sans laboratoire)</option>
                    {laboratories.map(lab => (
                      <option key={lab.id} value={lab.id}>{lab.clinic_name || lab.full_name} - {lab.city || ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" placeholder="Rechercher une analyse..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                  value={searchBio} onChange={e => setSearchBio(e.target.value)}
                />
              </div>

              {/* Bio exams list */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto custom-scrollbar p-1">
                {filteredBio.length > 0 ? filteredBio.map(exam => (
                  <label key={exam.id} className={cn(
                    "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                    selectedBioExams.includes(exam.name)
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : "bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200"
                  )}>
                    <input type="checkbox" checked={selectedBioExams.includes(exam.name)} onChange={() => toggleBioExam(exam.name)} className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500" />
                    <span className="text-xs font-bold leading-tight">{exam.name}</span>
                  </label>
                )) : (
                  <p className="text-xs text-slate-400 italic col-span-2 py-2">
                    {searchBio ? "Aucun résultat pour cette recherche." : "Aucun examen biologique dans la bibliothèque."}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'radiologie' && (
            <div className="space-y-4">
              {/* Imaging center selector */}
              {imagingCenters.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    Notifier un centre d'imagerie <span className="text-slate-300 font-medium normal-case tracking-normal">(optionnel)</span>
                  </label>
                  <select
                    className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500"
                    value={selectedImagingCenterId}
                    onChange={e => setSelectedImagingCenterId(e.target.value ? parseInt(e.target.value) : "")}
                  >
                    <option value="">Prescription directe (sans centre)</option>
                    {imagingCenters.map(ic => (
                      <option key={ic.id} value={ic.id}>{ic.clinic_name || ic.full_name} - {ic.city || ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text" placeholder="Rechercher un examen radiologique..."
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                  value={searchImaging} onChange={e => setSearchImaging(e.target.value)}
                />
              </div>

              {/* Imaging exams list */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto custom-scrollbar p-1">
                {filteredImaging.length > 0 ? filteredImaging.map(exam => (
                  <label key={exam.id} className={cn(
                    "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border",
                    selectedImagingExams.includes(exam.name)
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-200"
                  )}>
                    <input type="checkbox" checked={selectedImagingExams.includes(exam.name)} onChange={() => toggleImagingExam(exam.name)} className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500" />
                    <span className="text-xs font-bold leading-tight">{exam.name}</span>
                  </label>
                )) : (
                  <p className="text-xs text-slate-400 italic col-span-2 py-2">
                    {searchImaging ? "Aucun résultat pour cette recherche." : "Aucun examen radiologique dans la bibliothèque."}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Custom exam */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Examen personnalisé {activeTab === 'biologie' ? '(Biologie)' : '(Radiologie)'}
            </label>
            <div className="flex gap-2">
              <input type="text" placeholder="Nom de l'examen..." className="flex-1 px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-cyan-500"
                value={customExam} onChange={e => setCustomExam(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomExam(); } }} />
              <button onClick={addCustomExam} className="px-4 py-2.5 bg-cyan-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-cyan-700 transition-colors"><Plus size={16} /></button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 mt-6 border-t border-slate-100">
          <p className="text-xs text-slate-500 font-bold">
            {totalSelected > 0 ? `${totalSelected} examen${totalSelected > 1 ? 's' : ''} sélectionné${totalSelected > 1 ? 's' : ''}` : 'Aucun examen sélectionné'}
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs">Annuler</button>
            <button onClick={handleSubmit} disabled={submitting} className="px-8 py-3 rounded-xl font-bold bg-cyan-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-cyan-100">
              {submitting ? "..." : "Prescrire"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function HistorySection({ title, content, isWarning }: { title: string, content?: string, isWarning?: boolean }) {
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-black text-slate-400 uppercase tracking-widest">{title}</h5>
      <div className={cn(
        "p-4 rounded-2xl font-medium text-sm min-h-[60px]",
        isWarning ? "bg-rose-50 text-rose-900 border border-rose-100" : "bg-slate-50 text-slate-700 border border-transparent"
      )}>
        {content || <span className="opacity-40 italic">Aucune information renseignée</span>}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-6 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-all",
        active ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
      )}
    >
      {label}
    </button>
  );
}

function InfoItem({ label, value, isMono }: { label: string, value: string, isMono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={cn("text-slate-800 font-bold", isMono && "font-mono text-sm")}>{value}</p>
    </div>
  );
}

function VitalItem({ label, value, color }: { label: string, value: string, color: 'blue' | 'orange' | 'emerald' | 'indigo' }) {
  const colors = {
    blue: "text-blue-600 border-blue-100 bg-blue-50",
    orange: "text-orange-600 border-orange-100 bg-orange-50",
    emerald: "text-emerald-600 border-emerald-100 bg-emerald-50",
    indigo: "text-indigo-600 border-indigo-100 bg-indigo-50"
  };
  return (
    <div className={cn("p-3 rounded-xl border flex flex-col items-center justify-center text-center", colors[color])}>
      <p className="text-xs font-black uppercase tracking-tighter opacity-70 leading-none mb-1">{label}</p>
      <p className="text-base font-black leading-none">{value}</p>
    </div>
  );
}

function AppointmentManager({ appointments, onPatientClick, onRefresh, onSwitchToCalendar }: { appointments: Appointment[], onPatientClick: (id: number, appointment?: Appointment) => void, onRefresh: () => void, onSwitchToCalendar?: () => void }) {
  const { t } = useTranslation();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editAppointment, setEditAppointment] = useState<Appointment | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const handleStatusChange = async (app: Appointment, status: string) => {
    try {
      await api.updateAppointment(app.id, { ...app, status });
      onRefresh();
    } catch (err) {
      alert("Erreur lors du changement de statut");
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Supprimer ce rendez-vous ?")) return;
    try {
      await api.deleteAppointment(id);
      onRefresh();
    } catch (err) {
      alert("Erreur lors de la suppression");
    }
  };

  const statusColors: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700",
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-emerald-100 text-emerald-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
    refused: "bg-red-100 text-red-700",
    rescheduled: "bg-purple-100 text-purple-700"
  };
  const statusLabels: Record<string, string> = {
    scheduled: t("scheduled_badge"),
    pending: "En attente",
    confirmed: "Confirmé",
    completed: t("completed_badge"),
    cancelled: t("cancelled_badge"),
    refused: "Refusé",
    rescheduled: "Reporté"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
         <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{t("appointment_manager")}</h3>
            <p className="text-sm text-slate-500 font-medium">{t("appointment_subtitle")}</p>
         </div>
         <div className="flex gap-3">
           <button
             onClick={onSwitchToCalendar}
             className="px-5 py-3 bg-slate-50 text-slate-600 rounded-2xl font-black flex items-center gap-2 hover:bg-slate-100 transition-all uppercase tracking-widest text-[10px] border border-slate-200"
           >
              <CalendarRange size={16} />
              {t("calendar_view")}
           </button>
           <button
             onClick={() => setShowAddForm(true)}
             className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 uppercase tracking-widest text-[10px]"
           >
              <Plus size={16} />
               {t("new_appointment")}
           </button>
         </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-white rounded-2xl p-2 shadow-sm border border-slate-100">
        {[
          { id: 'all', label: 'Tous' },
          { id: 'pending', label: 'En attente' },
          { id: 'confirmed', label: 'Confirmé' },
          { id: 'completed', label: 'Terminé' },
          { id: 'refused', label: 'Refusé' },
          { id: 'cancelled', label: 'Annulé' },
          { id: 'rescheduled', label: 'Reporté' },
          { id: 'scheduled', label: 'Planifié' },
        ].map(f => (
          <button key={f.id} onClick={() => setStatusFilter(f.id)}
            className={cn("px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
              statusFilter === f.id ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
            )}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
         {appointments.filter(app => statusFilter === 'all' || app.status === statusFilter).map(app => (
            <div key={app.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:border-blue-200 transition-all group relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 flex gap-2">
                  <span className={cn("px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest", statusColors[app.status] || "bg-slate-100 text-slate-600")}>
                    {statusLabels[app.status] || app.status}
                  </span>
               </div>
               <div className="space-y-4">
                   <div className="flex justify-between items-start">
                     <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("patient_field")}</p>
                      {app.patient_name ? (
                        <div>
                          <p className="text-lg font-black text-slate-800 uppercase">{app.patient_name}</p>
                          {app.patient_phone && <p className="text-xs text-slate-500 font-medium flex items-center gap-1"><Phone size={11} /> {app.patient_phone}</p>}
                          {app.booking_reference && <p className="text-[10px] text-slate-400 font-mono mt-0.5">Réf: {app.booking_reference}</p>}
                        </div>
                      ) : (
                        <p className="text-lg font-black text-slate-800 uppercase group-hover:text-blue-600 transition-colors cursor-pointer" onClick={() => onPatientClick(app.patient_id, app)}>
                          {app.last_name} {app.first_name}
                        </p>
                      )}
                     </div>
                     <div className="flex gap-1">
                       <button onClick={() => setEditAppointment(app)} className="text-slate-300 hover:text-amber-600 transition-colors p-1.5 rounded-lg hover:bg-amber-50">
                         <Edit2 size={14} />
                       </button>
                       <button onClick={() => handleDelete(app.id)} className="text-slate-300 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50">
                         <Trash2 size={14} />
                       </button>
                     </div>
                   </div>
                   <div className="flex gap-4">
                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("date_field")}</p>
                         <p className="text-sm font-bold text-slate-700">{format(new Date(app.date), "dd/MM/yyyy")}</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("time_field")}</p>
                         <p className="text-sm font-mono font-bold text-slate-700 bg-slate-50 px-2 py-0.5 rounded text-blue-600">{app.hour?.slice(0, 5)}</p>
                      </div>
                      {app.source === 'mobile' && (
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Source</p>
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-bold">Mobile</span>
                        </div>
                      )}
                    </div>
                    {app.rescheduled_to_date && app.rescheduled_to_hour && (
                      <div className="bg-purple-50 rounded-xl p-3">
                        <p className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">Reporté au</p>
                        <p className="text-sm font-bold text-purple-700">{format(new Date(app.rescheduled_to_date), "dd/MM/yyyy")} à {app.rescheduled_to_hour}</p>
                      </div>
                    )}
                    <div>
                       <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("appointment_reason")}</p>
                      <p className="text-xs text-slate-500 font-medium italic">"{app.reason}"</p>
                   </div>
                   {app.doctor_notes && (
                     <div className="bg-slate-50 rounded-xl p-3">
                       <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Note du médecin</p>
                       <p className="text-xs text-slate-600">{app.doctor_notes}</p>
                     </div>
                   )}
                   {app.status === 'pending' && (
                     <div className="flex gap-2 pt-2 border-t border-slate-50">
                       <button onClick={async () => { try { await api.confirmAppointment(app.id); onRefresh(); } catch { alert("Erreur"); } }} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">Confirmer</button>
                       <button onClick={async () => { const reason = prompt("Motif du refus (optionnel):"); try { await api.refuseAppointment(app.id, reason || ''); onRefresh(); } catch { alert("Erreur"); } }} className="flex-1 py-1.5 bg-red-50 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all">Refuser</button>
                       <button onClick={async () => { const newDate = prompt("Nouvelle date (YYYY-MM-JJ):"); if (!newDate) return; const newHour = prompt("Nouvelle heure (HH:MM):"); if (!newHour) return; const reason = prompt("Motif du report (optionnel):"); try { await api.rescheduleAppointment(app.id, newDate, newHour, reason || ''); onRefresh(); } catch { alert("Erreur"); } }} className="flex-1 py-1.5 bg-purple-50 text-purple-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-100 transition-all">Reporter</button>
                     </div>
                   )}
                   {app.status === 'scheduled' && (
                     <div className="flex gap-2 pt-2 border-t border-slate-50">
                       <button onClick={() => handleStatusChange(app, 'completed')} className="flex-1 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all">{t("mark_done")}</button>
                       <button onClick={() => handleStatusChange(app, 'cancelled')} className="flex-1 py-1.5 bg-red-50 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all">{t("mark_cancel")}</button>
                     </div>
                   )}
               </div>
            </div>
         ))}
         {appointments.length === 0 && (
           <div className="md:col-span-2 lg:col-span-3 bg-white rounded-3xl p-16 text-center text-slate-400 italic shadow-sm border border-slate-100 uppercase tracking-widest text-[10px]">
              {t("no_appointments_list")}
           </div>
         )}
      </div>

      <AnimatePresence>
         {showAddForm && (
            <AppointmentForm
              onCancel={() => setShowAddForm(false)}
              onSuccess={() => { onRefresh(); setShowAddForm(false); }}
            />
         )}
         {editAppointment && (
           <AppointmentForm
             initialData={editAppointment}
             onCancel={() => setEditAppointment(null)}
             onSuccess={() => { onRefresh(); setEditAppointment(null); }}
           />
         )}
      </AnimatePresence>
    </motion.div>
  );
}

function AppointmentForm({ initialData, onCancel, onSuccess }: { initialData?: Appointment, onCancel: () => void, onSuccess: () => void }) {
  const { t } = useTranslation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [linkedDoctorIds, setLinkedDoctorIds] = useState<number[]>([]);
  const isEditing = !!initialData;
  const [formData, setFormData] = useState<Partial<Appointment>>(initialData ? {
    ...initialData,
    date: format(new Date(initialData.date), "yyyy-MM-dd"),
  } : {
    date: format(new Date(), "yyyy-MM-dd"),
    hour: "09:00",
    reason: "",
    duration: 30,
    status: "scheduled"
  });

  useEffect(() => {
    api.getPatients().then(setPatients).catch(console.error);
    api.getDoctors().then(setDoctors).catch(console.error);
    api.getMe().then(setMe).catch(console.error);
  }, []);

  useEffect(() => {
    if (me?.role === 'secretary') {
      api.getSecretaryLinks().then((links: any[]) => {
        setLinkedDoctorIds(links.map((l: any) => l.doctor_id));
      }).catch(() => {});
    }
  }, [me]);

  const availableDoctors = linkedDoctorIds.length > 0
    ? doctors.filter(d => linkedDoctorIds.includes(d.id))
    : doctors;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.patient_id) {
       alert(t("appointment_select_error"));
       return;
    }
    if (me?.role === 'secretary' && !formData.doctor_id) {
       alert(t("doctor_select_error"));
       return;
    }
    try {
      if (isEditing && initialData?.id) {
        await api.updateAppointment(initialData.id, formData);
      } else {
        await api.createAppointment(formData);
      }
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-lg">
        <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-8">{isEditing ? t("edit_appointment") : t("new_appointment")}</h3>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("patient_field")}</label>
            <select
              required
              className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
              value={formData.patient_id || ''}
              onChange={e => setFormData({ ...formData, patient_id: parseInt(e.target.value) })}
            >
              <option value="">{t("select_patient")}</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.last_name} {p.first_name}</option>
              ))}
            </select>
          </div>
          {me?.role === 'secretary' && (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("doctor_field")}</label>
              <select
                required
                className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                value={formData.doctor_id || ''}
                onChange={e => setFormData({ ...formData, doctor_id: parseInt(e.target.value) })}
              >
                <option value="">{t("select_doctor_app")}</option>
                {availableDoctors.map(d => <option key={d.id} value={d.id}>{d.full_name}{d.specialty ? ` - ${d.specialty}` : ''}</option>)}
              </select>
              {linkedDoctorIds.length > 0 && availableDoctors.length === 0 && <p className="text-[10px] text-red-500 font-bold mt-1">{t("no_doctor_linked_app")}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
              <div>
                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("date_field")}</label>
                 <input required type="date" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("time_field")}</label>
                 <input required type="time" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none" value={formData.hour} onChange={e => setFormData({ ...formData, hour: e.target.value })} />
              </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("appointment_reason")}</label>
            <input required type="text" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} placeholder={t("appointment_reason_placeholder")} />
          </div>
          <div className="flex justify-end gap-3 pt-4">
             <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs">{t("cancel")}</button>
             <button type="submit" className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-blue-100">{isEditing ? t("update_btn") : t("save")}</button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function ConsultationCard({ consult, onPrint, onEdit, onDelete, prescriptionStatus, patientMedicalHistory }: { consult: Consultation, onPrint: () => void, onEdit: () => void, onDelete?: () => void, prescriptionStatus?: string, key?: React.Key, patientMedicalHistory?: Patient['medical_history'] }) {
  const { t } = useTranslation();
  const restrictions = patientMedicalHistory?.medication_restrictions || [];
  const consultAllergyWarnings = consult.medications && restrictions.length > 0
    ? consult.medications.flatMap(m => {
        const lib = (m as any).libraryId ? null : null; // can't access medLibrary here
        const warns: { restrictionType: string; restrictionLabel: string }[] = [];
        restrictions.forEach(r => {
          if (r.type === 'allergy' && r.medicationId && r.medicationId === (m as any).libraryId) {
            warns.push({ restrictionType: 'allergy', restrictionLabel: `Allergie : ${r.medicationName}` });
          } else if (r.type === 'allergy' && !r.medicationId && m.name.toLowerCase().includes(r.medicationName.toLowerCase())) {
            warns.push({ restrictionType: 'allergy', restrictionLabel: `Allergie : ${r.medicationName}` });
          } else if (r.type === 'contraindication' && r.medicationId && r.medicationId === (m as any).libraryId) {
            warns.push({ restrictionType: 'contraindication', restrictionLabel: `Contre-indiqué : ${r.medicationName}` });
          } else if (r.type === 'contraindication' && !r.medicationId && m.name.toLowerCase().includes(r.medicationName.toLowerCase())) {
            warns.push({ restrictionType: 'contraindication', restrictionLabel: `Contre-indiqué : ${r.medicationName}` });
          } else if (r.type === 'intolerance' && m.name.toLowerCase().includes(r.medicationName.toLowerCase())) {
            warns.push({ restrictionType: 'intolerance', restrictionLabel: `Ne supporte pas : ${r.medicationName}` });
          }
        });
        return warns.length > 0 ? [{ medicationName: m.name, warns }] : [];
      })
    : [];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative group overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
      <div className="flex justify-between items-start mb-4">
        <div>
          <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Consultation {consult.prescription_code && `• Ordonnance: ${consult.prescription_code}`}</p>
          <div className="flex items-center gap-3">
            <p className="text-lg font-black text-slate-800 uppercase">{format(new Date(consult.date), "dd MMMM yyyy")}</p>
            {consult.doctor_name && <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded">par {consult.doctor_name}</span>}
            {prescriptionStatus && (
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1",
                prescriptionStatus === 'dispensed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              )}>
                {prescriptionStatus === 'dispensed' ? <CheckCircle size={10} /> : <Clock size={10} />}
                {prescriptionStatus === 'dispensed' ? 'Livrée' : 'Non livrée'}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="text-slate-400 hover:text-amber-600 transition-colors p-2 rounded-lg hover:bg-amber-50 flex items-center gap-2"
          >
            <Edit2 size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{t("edit")}</span>
          </button>
          <button
            onClick={onPrint}
            className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50 flex items-center gap-2"
          >
            <Printer size={20} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Ordonnance</span>
          </button>
            {onDelete && (
            <button
              onClick={onDelete}
              className="text-slate-400 hover:text-red-600 transition-colors p-2 rounded-lg hover:bg-red-50 flex items-center gap-2"
              title="Supprimer la consultation"
            >
              <Trash2 size={20} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Supprimer</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("reason")} & {t("symptoms")}</h5>
          <div className="text-sm text-slate-700 italic border-l-2 border-slate-100 pl-3 py-1 space-y-1">
            <div className="flex flex-wrap gap-1.5">
              {(() => { try { const r = JSON.parse(consult.reason || '[]'); return Array.isArray(r) ? r : [consult.reason]; } catch { return [consult.reason]; } })().filter(Boolean).map((r: string, i: number) => (
                <span key={i} className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold not-italic">{r}</span>
              ))}
            </div>
            {consult.symptoms && <p className="mt-1">{consult.symptoms}</p>}
          </div>
        </div>
        <div>
          <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{t("diagnosis")}</h5>
          <div className="flex flex-wrap gap-1.5">
            {(() => { try { const d = JSON.parse(consult.diagnosis || '[]'); return Array.isArray(d) ? d : [consult.diagnosis]; } catch { return [consult.diagnosis]; } })().filter(Boolean).map((d: string, i: number) => (
              <span key={i} className="inline-flex px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">{d}</span>
            )) || <span className="text-sm font-bold text-slate-800 bg-slate-50 p-2 rounded-lg">-</span>}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-400 uppercase">{t("temp")}</span>
          <span className="text-xs font-bold text-slate-700">{consult.temperature ? `${consult.temperature}°C` : '-'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-400 uppercase">{t("bp")}</span>
          <span className="text-xs font-bold text-slate-700">{consult.bp || '-'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-400 uppercase">{t("weight")}</span>
          <span className="text-xs font-bold text-slate-700">{consult.weight ? `${consult.weight}kg` : '-'}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-400 uppercase">{t("glycemia")}</span>
          <span className="text-xs font-bold text-slate-700">{consult.glycemia ? `${consult.glycemia}g/L` : '-'}</span>
        </div>
      </div>

      {consult.medications && consult.medications.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-50">
          <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Prescription <span className="ml-2 text-blue-600 not-italic">({consult.medications.length} médicament{consult.medications.length > 1 ? 's' : ''})</span></h5>
          {consultAllergyWarnings.length > 0 && (
            <div className="space-y-1 mb-2">
              {consultAllergyWarnings.map((item, idx) =>
                item.warns.map((w, wi) => {
                  const warnColors = w.restrictionType === 'allergy' ? 'bg-red-50 border-red-300 text-red-700' :
                    w.restrictionType === 'contraindication' ? 'bg-purple-50 border-purple-300 text-purple-700' :
                    w.restrictionType === 'class' ? 'bg-orange-50 border-orange-300 text-orange-700' :
                    'bg-amber-50 border-amber-300 text-amber-700';
                  return (
                    <div key={`${idx}-${wi}`} className={cn("flex items-start gap-2 p-2 rounded-xl border", warnColors)}>
                      <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                      <p className="text-[10px] font-bold"><span>{w.restrictionLabel}</span> — <span className="opacity-80">{item.medicationName}</span></p>
                    </div>
                  );
                })
              )}
            </div>
          )}
          <div className="space-y-2">
            {consult.medications.map((m, i) => {
              const sev = (m as any).severity;
              const hasCardWarning = consultAllergyWarnings.some(item => item.medicationName === m.name);
              const cardWarning = consultAllergyWarnings.find(item => item.medicationName === m.name);
              const sevStyle = sev === 'contre_indication' ? 'bg-red-100 border-red-400 text-red-800' :
                sev === 'majeur' ? 'bg-red-50 border-red-300 text-red-700' :
                sev === 'moderate' ? 'bg-orange-50 border-orange-300 text-orange-700' :
                sev === 'mineur' ? 'bg-amber-50 border-amber-300 text-amber-700' :
                hasCardWarning ? (
                  cardWarning!.warns[0].restrictionType === 'contraindication' ? 'bg-purple-50 border-purple-300 text-purple-700' :
                  cardWarning!.warns[0].restrictionType === 'class' ? 'bg-orange-50 border-orange-300 text-orange-700' :
                  cardWarning!.warns[0].restrictionType === 'intolerance' ? 'bg-amber-50 border-amber-300 text-amber-700' :
                  'bg-red-50 border-red-300 text-red-700'
                ) : 'bg-slate-50 border-slate-100 text-slate-700';
              const cardDotColor = sev === 'contre_indication' ? 'bg-red-600' :
                sev === 'majeur' ? 'bg-red-500' :
                sev === 'moderate' ? 'bg-orange-500' :
                sev === 'mineur' ? 'bg-amber-500' :
                hasCardWarning ? (
                  cardWarning!.warns[0].restrictionType === 'contraindication' ? 'bg-purple-500' :
                  cardWarning!.warns[0].restrictionType === 'class' ? 'bg-orange-500' :
                  cardWarning!.warns[0].restrictionType === 'intolerance' ? 'bg-amber-500' :
                  'bg-red-500'
                ) : '';
              return (
              <div key={i} className={cn("flex items-center justify-between text-xs p-2 rounded-lg border", sevStyle)}>
                <div className="flex items-center gap-2">
                  {(sev || hasCardWarning) && <span className={cn("w-2 h-2 rounded-full shrink-0", cardDotColor)} />}
                  <span className="font-bold">{m.name}</span>
                </div>
                <span className="opacity-70">{m.dosage} • {m.duration}</span>
              </div>
            );})}
          </div>
        </div>
      )}

      {consult.notes && (
        <div className="mt-4 pt-4 border-t border-slate-50">
          <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("notes")}</h5>
          <p className="text-xs text-slate-500 line-clamp-2 italic">{consult.notes}</p>
        </div>
      )}
    </motion.div>
  );
}

function ConsultationForm({ patientId, initialData, onCancel, onSuccess, isShared, appointmentId, appointmentReason, patientMedicalHistory }: { patientId: number, initialData?: Consultation, onCancel: () => void, onSuccess: () => void, isShared?: boolean, appointmentId?: number | null, appointmentReason?: string, patientMedicalHistory?: Patient['medical_history'] }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<Consultation>>(initialData ? {
    ...initialData,
    date: format(new Date(initialData.date), "yyyy-MM-dd"),
    medications: initialData.medications || []
  } : {
    patient_id: patientId,
    date: format(new Date(), "yyyy-MM-dd"),
    medications: []
  });

  const [medInput, setMedInput] = useState<Medication>({
    name: '',
    dosage: '',
    frequency: '',
    duration: '',
    instructions: '',
    form: '',
    libraryId: undefined
  });

  const [medLibrary, setMedLibrary] = useState<MedicationLibrary[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeInput, setActiveInput] = useState<'dosage' | 'duration' | 'instructions' | null>(null);
  const [motifLibrary, setMotifLibrary] = useState<SimpleListItem[]>([]);
  const [showMotifSuggestions, setShowMotifSuggestions] = useState(false);
  const [diagnosisLibrary, setDiagnosisLibrary] = useState<SimpleListItem[]>([]);
  const [showDiagnosisSuggestions, setShowDiagnosisSuggestions] = useState(false);
  const [prescriptionTemplates, setPrescriptionTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [allergyWarnings, setAllergyWarnings] = useState<{ medicationName: string; restrictionType: string; restrictionLabel: string }[]>([]);
  const [duplicateDciWarnings, setDuplicateDciWarnings] = useState<string[]>([]);
  const [dciInteractionWarnings, setDciInteractionWarnings] = useState<DciInteraction[]>([]);
  const parseTagArray = (val: string | undefined): string[] => {
    if (!val) return [];
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : [val]; } catch { return [val]; }
  };
  const [reasons, setReasons] = useState<string[]>(() => {
    if (initialData) return parseTagArray(initialData.reason);
    return appointmentReason ? [appointmentReason] : [];
  });
  const [diagnoses, setDiagnoses] = useState<string[]>(() => parseTagArray(initialData?.diagnosis));
  const reasonsRef = useRef(reasons); reasonsRef.current = reasons;
  const diagnosesRef = useRef(diagnoses); diagnosesRef.current = diagnoses;
  const [currentReason, setCurrentReason] = useState('');
  const [currentDiagnosis, setCurrentDiagnosis] = useState('');

  const computeAllergyWarnings = (medications: Medication[], restrictions: MedicationRestriction[], library: MedicationLibrary[]) => {
    if (!restrictions.length || !medications.length) return [];
    const warnings: { medicationName: string; restrictionType: string; restrictionLabel: string }[] = [];
    medications.forEach(m => {
      const lib = m.libraryId ? library.find(l => l.id === m.libraryId) : null;
      restrictions.forEach(r => {
        if (r.type === 'allergy' && r.medicationId && r.medicationId === m.libraryId) {
          warnings.push({ medicationName: m.name, restrictionType: 'allergy', restrictionLabel: `Allergie : ${r.medicationName}` });
        } else if (r.type === 'allergy' && !r.medicationId && m.name.toLowerCase().includes(r.medicationName.toLowerCase())) {
          warnings.push({ medicationName: m.name, restrictionType: 'allergy', restrictionLabel: `Allergie : ${r.medicationName}` });
        } else if (r.type === 'intolerance' && lib?.form?.toLowerCase().includes(r.medicationName.toLowerCase())) {
          warnings.push({ medicationName: m.name, restrictionType: 'intolerance', restrictionLabel: `Ne supporte pas : ${r.medicationName}` });
        } else if (r.type === 'intolerance' && m.name.toLowerCase().includes(r.medicationName.toLowerCase())) {
          warnings.push({ medicationName: m.name, restrictionType: 'intolerance', restrictionLabel: `Ne supporte pas : ${r.medicationName}` });
        } else if (r.type === 'class' && lib?.classe?.toLowerCase().includes(r.medicationName.toLowerCase())) {
          warnings.push({ medicationName: m.name, restrictionType: 'class', restrictionLabel: `Allergie de classe : ${r.medicationName}` });
        } else if (r.type === 'contraindication' && r.medicationId && r.medicationId === m.libraryId) {
          warnings.push({ medicationName: m.name, restrictionType: 'contraindication', restrictionLabel: `Contre-indiqué : ${r.medicationName}` });
        } else if (r.type === 'contraindication' && !r.medicationId && m.name.toLowerCase().includes(r.medicationName.toLowerCase())) {
          warnings.push({ medicationName: m.name, restrictionType: 'contraindication', restrictionLabel: `Contre-indiqué : ${r.medicationName}` });
        }
      });
    });
    return warnings;
  };

  useEffect(() => {
    api.getMedicationsLibrary().then(setMedLibrary).catch(console.error);
    api.getConsultationMotifs().then(setMotifLibrary).catch(console.error);
    api.getDiagnoses().then(setDiagnosisLibrary).catch(console.error);
    api.getPrescriptionTemplates().then(setPrescriptionTemplates).catch(console.error);
  }, []);

  // Check initial medications against patient restrictions
  useEffect(() => {
    const restrictions = patientMedicalHistory?.medication_restrictions || [];
    const initialMeds = formData.medications || [];
    if (restrictions.length > 0 && initialMeds.length > 0 && medLibrary.length > 0) {
      setAllergyWarnings(computeAllergyWarnings(initialMeds, restrictions, medLibrary));
    }
  }, [medLibrary, patientMedicalHistory]);

  const handleTemplateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedTemplate(val);
    if (!val) return;
    const tmpl = prescriptionTemplates.find(t => t.id === parseInt(val));
    if (tmpl) {
      const meds = typeof tmpl.medications === 'string' ? JSON.parse(tmpl.medications) : tmpl.medications;
      setFormData({ ...formData, medications: meds });
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim() || !formData.medications?.length) return;
    try {
      await api.createPrescriptionTemplate(templateName.trim(), formData.medications);
      setTemplateName('');
      setShowSaveTemplate(false);
      const templates = await api.getPrescriptionTemplates();
      setPrescriptionTemplates(templates);
    } catch (e) { console.error(e); alert("Erreur lors de l'enregistrement du modèle : " + (e instanceof Error ? e.message : "erreur inconnue")); }
  };

  const selectSuggestedMed = (med: MedicationLibrary) => {
    setMedInput({
      name: med.name,
      dosage: med.dosage || '',
      frequency: '',
      duration: '',
      instructions: med.posology || '',
      form: med.form || '',
      libraryId: med.id
    });
    setShowSuggestions(false);
  };

  const commonDosages = ["500mg", "1g", "250mg", "100mg", "50mg", "5ml", "10ml"];
  const commonPosologies = [
    "1 cp x 3 / jour",
    "1 cp x 2 / jour",
    "1 cp le soir",
    "1 cp le matin",
    "Avant les repas",
    "Après les repas",
    "Pendant les repas"
  ];
  const commonDurations = ["7 jours", "10 jours", "15 jours", "30 jours", "3 mois", "En cas de besoin"];

  const addMedication = async () => {
    if (!medInput.name) return;
    const medName = medInput.name.trim();
    const newMeds = [...(formData.medications || []), medInput];
    setFormData({ ...formData, medications: newMeds });
    setMedInput({ name: '', dosage: '', frequency: '', duration: '', instructions: '', form: '', libraryId: undefined });
    // Check patient restrictions (allergies/intolerances)
    const restrictions = patientMedicalHistory?.medication_restrictions || [];
    if (restrictions.length > 0) {
      setAllergyWarnings(computeAllergyWarnings(newMeds, restrictions, medLibrary));
    } else { setAllergyWarnings([]); }
    // Check duplicate DCI
    const dciList: string[] = [];
    newMeds.forEach(m => {
      const lib = m.libraryId ? medLibrary.find(l => l.id === m.libraryId) : null;
      if (lib?.dci) dciList.push(lib.dci.trim().toLowerCase());
    });
    const seen: Record<string, number> = {};
    const dupes: string[] = [];
    dciList.forEach(d => {
      seen[d] = (seen[d] || 0) + 1;
      if (seen[d] === 2) dupes.push(d);
    });
    const dupMedNames = newMeds.filter(m => {
      const lib = m.libraryId ? medLibrary.find(l => l.id === m.libraryId) : null;
      return lib?.dci && dupes.includes(lib.dci.trim().toLowerCase());
    }).map(m => m.name);
    setDuplicateDciWarnings(dupMedNames);
    // Check DCI-level interactions
    const uniqueDcis = [...new Set(dciList.filter(Boolean))];
    if (uniqueDcis.length >= 2) {
      try {
        const dciWarnings = await api.checkDciInteractions(uniqueDcis);
        setDciInteractionWarnings(dciWarnings || []);
      } catch (e) { console.error("DCI interaction check failed:", e); }
    } else { setDciInteractionWarnings([]); }
  };

  const removeMedication = async (index: number) => {
    const updated = (formData.medications || []).filter((_, i) => i !== index);
    setFormData({ ...formData, medications: updated });
    // Recalculate allergy warnings
    const restrictions = patientMedicalHistory?.medication_restrictions || [];
    if (restrictions.length > 0) {
      setAllergyWarnings(computeAllergyWarnings(updated, restrictions, medLibrary));
    } else { setAllergyWarnings([]); }
    // Re-check DCI duplicates and DCI interactions
    const dciList: string[] = [];
    updated.forEach(m => {
      const lib = m.libraryId ? medLibrary.find(l => l.id === m.libraryId) : null;
      if (lib?.dci) dciList.push(lib.dci.trim().toLowerCase());
    });
    const seen: Record<string, number> = {};
    const dupes: string[] = [];
    dciList.forEach(d => {
      seen[d] = (seen[d] || 0) + 1;
      if (seen[d] === 2) dupes.push(d);
    });
    const dupMedNames = updated.filter(m => {
      const lib = m.libraryId ? medLibrary.find(l => l.id === m.libraryId) : null;
      return lib?.dci && dupes.includes(lib.dci.trim().toLowerCase());
    }).map(m => m.name);
    setDuplicateDciWarnings(dupMedNames);
    const uniqueDcis = [...new Set(dciList.filter(Boolean))];
    if (uniqueDcis.length >= 2) {
      try { const dciW = await api.checkDciInteractions(uniqueDcis); setDciInteractionWarnings(dciW || []); }
      catch (e) { console.error("DCI interaction re-check failed:", e); }
    } else { setDciInteractionWarnings([]); }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (reasonsRef.current.length === 0 || diagnosesRef.current.length === 0) { alert("Veuillez saisir au moins un motif et un diagnostic."); return; }
    try {
      const payload = { ...formData, medications: formData.medications || [], reason: JSON.stringify(reasons), diagnosis: JSON.stringify(diagnoses) };
      if (initialData?.id) {
        await api.updateConsultation(initialData.id, payload);
      } else {
        await api.createConsultation(payload);
        if (appointmentId) {
          await api.updateAppointment(appointmentId, { status: 'completed' } as any);
        }
      }
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-3xl my-8"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
            {initialData ? "Modifier Consultation" : t("new_consultation")}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
             <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
              <div className="md:col-span-2 relative">
                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("reason")}</label>
                 <div className="flex flex-wrap gap-1.5 mb-1.5">
                   {reasons.map((r, i) => (
                     <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold">
                       {r}
                       <button type="button" onClick={() => setReasons(reasons.filter((_, j) => j !== i))} className="hover:text-blue-900"><X size={12} /></button>
                     </span>
                   ))}
                 </div>
                 <div className="flex gap-2">
                   <input type="text" className="flex-1 px-4 py-2 bg-blue-50 border-2 border-blue-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-800" value={currentReason} onChange={e => { setCurrentReason(e.target.value); setShowMotifSuggestions(true); }} onFocus={() => setShowMotifSuggestions(true)} onBlur={() => setTimeout(() => setShowMotifSuggestions(false), 200)} onKeyDown={e => { if (e.key === 'Enter' && currentReason.trim()) { e.preventDefault(); if (!reasons.includes(currentReason.trim())) setReasons([...reasons, currentReason.trim()]); setCurrentReason(''); } }} placeholder={reasons.length === 0 ? t("reason") || 'Motif...' : 'Ajouter un motif...'} />
                   <button type="button" onClick={() => { if (currentReason.trim() && !reasons.includes(currentReason.trim())) { setReasons([...reasons, currentReason.trim()]); setCurrentReason(''); } }} className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shrink-0">+</button>
                 </div>
                 {showMotifSuggestions && motifLibrary.length > 0 && currentReason.length > 0 && (
                   <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-40 overflow-auto" style={{ top: '100%' }}>
                     {motifLibrary.filter(m => m.name.toLowerCase().includes((currentReason || '').toLowerCase())).map(m => (
                       <button key={m.id} type="button" onMouseDown={() => { if (!reasons.includes(m.name)) setReasons([...reasons, m.name]); setCurrentReason(''); setShowMotifSuggestions(false); }}
                         className="w-full text-left px-4 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0">
                         {m.name}
                       </button>
                     ))}
                   </div>
                 )}
              </div>
               <div className="md:col-span-2 relative">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("diagnosis")}</label>
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {diagnoses.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">
                        {d}
                        <button type="button" onClick={() => setDiagnoses(diagnoses.filter((_, j) => j !== i))} className="hover:text-emerald-900"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" className="flex-1 px-4 py-2 bg-emerald-50 border-2 border-emerald-100 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800" value={currentDiagnosis} onChange={e => { setCurrentDiagnosis(e.target.value); setShowDiagnosisSuggestions(true); }} onFocus={() => setShowDiagnosisSuggestions(true)} onBlur={() => setTimeout(() => setShowDiagnosisSuggestions(false), 200)} onKeyDown={e => { if (e.key === 'Enter' && currentDiagnosis.trim()) { e.preventDefault(); if (!diagnoses.includes(currentDiagnosis.trim())) setDiagnoses([...diagnoses, currentDiagnosis.trim()]); setCurrentDiagnosis(''); } }} placeholder={diagnoses.length === 0 ? t("diagnosis") || 'Diagnostic...' : 'Ajouter un diagnostic...'} />
                    <button type="button" onClick={() => { if (currentDiagnosis.trim() && !diagnoses.includes(currentDiagnosis.trim())) { setDiagnoses([...diagnoses, currentDiagnosis.trim()]); setCurrentDiagnosis(''); } }} className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0">+</button>
                  </div>
                  {showDiagnosisSuggestions && diagnosisLibrary.length > 0 && currentDiagnosis.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-40 overflow-auto" style={{ top: '100%' }}>
                      {diagnosisLibrary.filter(d => d.name.toLowerCase().includes((currentDiagnosis || '').toLowerCase())).map(d => (
                        <button key={d.id} type="button" onMouseDown={() => { if (!diagnoses.includes(d.name)) setDiagnoses([...diagnoses, d.name]); setCurrentDiagnosis(''); setShowDiagnosisSuggestions(false); }} className="w-full text-left px-4 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-emerald-50 transition-colors border-b border-slate-50 last:border-0">{d.name}</button>
                      ))}
                    </div>
                  )}
               </div>
          </div>

          <div className="overflow-y-auto max-h-[55vh] space-y-4 pr-1 custom-scrollbar">
           <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{t("symptoms")}</label>
              <textarea
                rows={2}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none resize-none text-slate-700 italic text-sm"
                value={formData.symptoms || ''}
                onChange={e => setFormData({ ...formData, symptoms: e.target.value })}
              />
           </div>

           <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("temp")}</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full px-4 py-2 bg-slate-50 rounded-xl border-none font-mono text-sm"
                  value={formData.temperature || ''}
                  onChange={e => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("bp")}</label>
                <input
                  type="text"
                  placeholder="12/8"
                  className="w-full px-4 py-2 bg-slate-50 rounded-xl border-none font-mono text-sm"
                  value={formData.bp || ''}
                  onChange={e => setFormData({ ...formData, bp: e.target.value })}
                />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("weight")} (kg)</label>
                <input
                   type="number"
                   className="w-full px-4 py-2 bg-slate-50 rounded-xl border-none font-mono text-sm"
                   value={formData.weight || ''}
                   onChange={e => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
                />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{t("glycemia")}</label>
                <input
                   type="number"
                   step="0.01"
                   className="w-full px-4 py-2 bg-slate-50 rounded-xl border-none font-mono text-sm"
                   value={formData.glycemia || ''}
                   onChange={e => setFormData({ ...formData, glycemia: parseFloat(e.target.value) })}
                />
             </div>
          </div>

           <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{t("notes")}</label>
              <textarea
                rows={1}
                className="w-full px-3 py-2 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none resize-none text-slate-700 italic text-sm"
                placeholder="Observations complémentaires..."
                value={formData.notes || ''}
                onChange={e => setFormData({ ...formData, notes: e.target.value })}
              />
           </div>

           {/* Prescription Templates Section */}
          {!initialData && (
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <ClipboardList size={16} className="text-indigo-500" />
                  Modèles d'ordonnance
                </h4>
                <div className="flex items-center gap-2">
                  {prescriptionTemplates.length > 0 && (
                    <select value={selectedTemplate} onChange={handleTemplateSelect} className="px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700 outline-none">
                      <option value="">Charger un modèle...</option>
                      {prescriptionTemplates.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                  {formData.medications && formData.medications.length > 0 && (
                    <button type="button" onClick={() => setShowSaveTemplate(!showSaveTemplate)} className="px-2 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100">
                      {showSaveTemplate ? 'Annuler' : 'Enreg. modèle'}
                    </button>
                  )}
                </div>
              </div>
              {showSaveTemplate && (
                <div className="flex gap-2 p-3 bg-white rounded-xl border border-indigo-200">
                  <input type="text" placeholder="Nom du modèle..." className="flex-1 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-sm font-bold text-slate-700 outline-none" value={templateName} onChange={e => setTemplateName(e.target.value)} />
                  <button type="button" onClick={handleSaveTemplate} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-indigo-700">Sauvegarder</button>
                </div>
              )}
              {prescriptionTemplates.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {prescriptionTemplates.map(t => (
                    <div key={t.id} className="flex items-center gap-1 px-3 py-1.5 bg-white rounded-lg border border-slate-200 text-[10px] font-bold text-slate-700">
                      <ClipboardList size={12} className="text-indigo-400" />
                      {t.name}
                      <button type="button" onClick={async () => { if (confirm(`Supprimer le modèle "${t.name}" ?`)) { try { await api.deletePrescriptionTemplate(t.id); const updated = await api.getPrescriptionTemplates(); setPrescriptionTemplates(updated); if (selectedTemplate === String(t.id)) setSelectedTemplate(''); } catch {} } }} className="text-slate-300 hover:text-red-500 ml-1">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Prescription Section */}
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <FileText size={16} className="text-blue-500" />
                Prescription (Ordonnance)
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="md:col-span-4 relative">
                <input
                  type="text"
                  placeholder="Médicament (ex: Amoxicilline)"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-bold text-slate-800"
                  value={medInput.name}
                  onChange={e => {
                    setMedInput({...medInput, name: e.target.value});
                    setShowSuggestions(true);
                  }}
                  onFocus={() => { setShowSuggestions(true); setActiveInput(null); }}
                />
                {showSuggestions && (medInput.name.length > 0) && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-300 max-h-48 overflow-auto">
                    {medLibrary.filter(m => m.name.toLowerCase().includes(medInput.name.toLowerCase())).map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => selectSuggestedMed(m)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <p className="font-extrabold text-slate-800 tracking-tight uppercase text-xs">{m.name} <span className="text-[10px] text-blue-600 ml-2 bg-blue-50 px-1 rounded">{m.form || m.abbreviation}</span></p>
                        <p className="text-[10px] text-slate-400 font-bold">{m.dosage}{m.unit ? ` (${m.unit})` : ''}{m.packaging ? ` • ${m.packaging}` : ''}{m.dci ? ` • ${m.dci}` : ''}</p>
                      </button>
                    ))}
                    {medLibrary.filter(m => m.name.toLowerCase().includes(medInput.name.toLowerCase())).length === 0 && (
                       <div className="px-4 py-3 text-[10px] font-bold text-slate-400 italic">
                          Nouveau médicament
                       </div>
                    )}
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Dosage"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-bold text-slate-700"
                  value={medInput.dosage}
                  onChange={e => setMedInput({...medInput, dosage: e.target.value})}
                  onFocus={() => { setActiveInput('dosage'); setShowSuggestions(false); }}
                />
                {activeInput === 'dosage' && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-300 p-2 grid grid-cols-2 gap-1 overflow-hidden">
                    {commonDosages.map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setMedInput({...medInput, dosage: d}); setActiveInput(null); }}
                        className="px-2 py-1.5 text-[10px] font-extrabold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors text-left"
                      >
                        {d}
                      </button>
                    ))}
                    <button type="button" onClick={() => setActiveInput(null)} className="col-span-2 text-[10px] uppercase font-black text-slate-300 pt-1 text-center">Fermer</button>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Durée"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-bold text-slate-700"
                  value={medInput.duration}
                  onChange={e => setMedInput({...medInput, duration: e.target.value})}
                  onFocus={() => { setActiveInput('duration'); setShowSuggestions(false); }}
                />
                {activeInput === 'duration' && (
                  <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-300 p-2 grid grid-cols-2 gap-1">
                    {commonDurations.map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => { setMedInput({...medInput, duration: d}); setActiveInput(null); }}
                        className="px-2 py-1.5 text-[10px] font-extrabold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors text-left"
                      >
                        {d}
                      </button>
                    ))}
                    <button type="button" onClick={() => setActiveInput(null)} className="col-span-2 text-[10px] uppercase font-black text-slate-300 pt-1 text-center">Fermer</button>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Posologie"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-bold text-slate-700"
                  value={medInput.instructions}
                  onChange={e => setMedInput({...medInput, instructions: e.target.value})}
                  onFocus={() => { setActiveInput('instructions'); setShowSuggestions(false); }}
                />
                {activeInput === 'instructions' && (
                  <div className="absolute z-50 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 p-2 space-y-1 overflow-auto max-h-48">
                    {commonPosologies.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setMedInput({...medInput, instructions: p}); setActiveInput(null); }}
                        className="w-full px-3 py-2 text-[10px] font-extrabold text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors text-left border-b border-slate-50 last:border-0"
                      >
                        {p}
                      </button>
                    ))}
                    <button type="button" onClick={() => setActiveInput(null)} className="w-full text-[10px] uppercase font-black text-slate-300 pt-1 text-center">Fermer</button>
                  </div>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="Forme"
                  className="w-full px-3 py-2 bg-white rounded-lg border border-slate-700 text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm font-bold text-slate-700"
                  value={medInput.form || ''}
                  onChange={e => setMedInput({...medInput, form: e.target.value})}
                />
              </div>

              <button
                type="button"
                onClick={addMedication}
                className="md:col-span-4 bg-blue-600 text-white font-bold py-2 rounded-lg text-xs uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-lg shadow-blue-100"
              >
                Ajouter à l'ordonnance
              </button>
            </div>


            {allergyWarnings.length > 0 && (
              <div className="space-y-1 mb-3">
                {allergyWarnings.map((aw, i) => {
                  const warnColors = aw.restrictionType === 'allergy' ? 'bg-red-50 border-red-300 text-red-700' :
                    aw.restrictionType === 'contraindication' ? 'bg-purple-50 border-purple-300 text-purple-700' :
                    aw.restrictionType === 'class' ? 'bg-orange-50 border-orange-300 text-orange-700' :
                    'bg-amber-50 border-amber-300 text-amber-700';
                  return (
                  <div key={i} className={cn("flex items-start gap-2 p-2 rounded-xl border", warnColors)}>
                    <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-[10px] font-bold"><span>{aw.restrictionLabel}</span> — <span className="opacity-80">{aw.medicationName}</span></p>
                    </div>
                  </div>
                );})}
              </div>
            )}
            {duplicateDciWarnings.length > 0 && (
              <div className="p-3 mb-3 bg-yellow-50 border-2 border-yellow-300 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black text-yellow-800 uppercase tracking-widest">DCI en double détecté</p>
                    <p className="text-xs font-bold text-yellow-700 mt-1">Plusieurs médicaments partagent le même principe actif (DCI) : {duplicateDciWarnings.join(', ')}. Soyez vigilant.</p>
                  </div>
                </div>
              </div>
            )}
            {dciInteractionWarnings.length > 0 && (
              <div className="space-y-1 mb-3">
                {dciInteractionWarnings.map((dw, i) => {
                  const severityColors: Record<string, string> = {
                    moderate: 'border-orange-400 bg-orange-50',
                    majeur: 'border-red-500 bg-red-50',
                    contre_indication: 'border-red-800 bg-red-950/10',
                    mineur: 'border-blue-200 bg-blue-50'
                  };
                  const sevIcon = dw.severity === 'contre_indication' ? <ShieldAlert size={16} className="text-red-800" /> :
                    dw.severity === 'majeur' ? <AlertTriangle size={16} className="text-red-600" /> :
                    <AlertTriangle size={16} className="text-orange-600" />;
                  return (
                  <div key={`dci-${i}`} className={cn("flex items-start gap-3 p-3 rounded-xl border-2", severityColors[dw.severity] || 'border-slate-200 bg-slate-50')}>
                    {sevIcon}
                    <div className="flex-1">
                      <p className="font-bold text-xs text-slate-800">Interaction DCI : <span className="underline">{dw.dci1}</span> ↔ <span className="underline">{dw.dci2}</span></p>
                      <div className="flex gap-2 mt-1">
                        <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border",
                          dw.severity === 'moderate' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                          dw.severity === 'majeur' ? 'bg-red-100 text-red-700 border-red-200' :
                          dw.severity === 'contre_indication' ? 'bg-red-800 text-white border-red-900' :
                          'bg-blue-100 text-blue-700 border-blue-200'
                        )}>{t("severity_" + dw.severity)}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">{t("desc_" + dw.description)}</span>
                      </div>
                    </div>
                  </div>
                );})}
              </div>
            )}
            <div className="space-y-2">
              {formData.medications?.map((m, i) => {
                const hasAllergyWarning = allergyWarnings.some(aw => aw.medicationName === m.name);
                const allergyForThis = allergyWarnings.find(aw => aw.medicationName === m.name);
                const severityStyle = hasAllergyWarning ? (
                  allergyForThis!.restrictionType === 'contraindication' ? 'bg-purple-50 border-purple-300 text-purple-700' :
                  allergyForThis!.restrictionType === 'class' ? 'bg-orange-50 border-orange-300 text-orange-700' :
                  allergyForThis!.restrictionType === 'intolerance' ? 'bg-amber-50 border-amber-300 text-amber-700' :
                  'bg-red-50 border-red-300 text-red-700'
                ) : 'bg-white border-slate-100 text-slate-800';
                const dotColor = hasAllergyWarning ? (
                  allergyForThis!.restrictionType === 'contraindication' ? 'bg-purple-500' :
                  allergyForThis!.restrictionType === 'class' ? 'bg-orange-500' :
                  allergyForThis!.restrictionType === 'intolerance' ? 'bg-amber-500' :
                  'bg-red-500'
                ) : '';
                return (
                <div key={i} className={cn("flex items-center justify-between p-3 rounded-xl border group shadow-sm transition-all hover:shadow-md", severityStyle)}>
                  <div className="flex items-center gap-2">
                    {hasAllergyWarning && (
                      <span className={cn("w-2 h-2 rounded-full shrink-0", dotColor)} />
                    )}
                    <div>
                      <p className="font-bold text-sm">{m.name}</p>
                      <p className="text-xs text-inherit opacity-70">{m.form && `${m.form} • `}{m.dosage} • {m.duration} {m.instructions && `• ${m.instructions}`}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeMedication(i)} className="text-inherit opacity-40 hover:opacity-100 transition-opacity">
                    <X size={16} />
                  </button>
                </div>
              );})}
              {(!formData.medications || formData.medications.length === 0) && (
                <p className="text-center py-4 text-xs text-slate-400 italic">{t("no_medications")}</p>
              )}
            </div>
          </div>



          </div>

           <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
              <button type="button" onClick={onCancel} className="px-8 py-3.5 rounded-2xl font-black bg-slate-100 text-slate-500 uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all">{t("cancel")}</button>
              <button type="submit" className="px-10 py-3.5 rounded-2xl font-black bg-blue-600 text-white uppercase tracking-widest text-[10px] shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2">
                <CheckCircle size={16} />
                {t("save")}
             </button>
           </div>
         </form>
      </motion.div>
    </div>
  );
}

function MedicalExamForm({ patientId, initialData, onCancel, onSuccess }: { patientId: number, initialData?: MedicalExam, onCancel: () => void, onSuccess: () => void }) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<MedicalExam>>(initialData ? {
    ...initialData,
    date: format(new Date(initialData.date), "yyyy-MM-dd")
  } : {
    patient_id: patientId,
    type: 'analysis',
    date: format(new Date(), "yyyy-MM-dd")
  });
  const [examLibrary, setExamLibrary] = useState<ParaclinicalExam[]>([]);
  const [showExamSuggestions, setShowExamSuggestions] = useState(false);

  useEffect(() => {
    api.getParaclinicalExams().then(setExamLibrary).catch(console.error);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (initialData?.id) {
        await api.updateMedicalExam(initialData.id, formData);
      } else {
        await api.createMedicalExam(formData);
      }
      onSuccess();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-2xl my-auto"
      >
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
            {initialData ? "Saisir Rapport d'Examen" : "Nouvel Examen"}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
             <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Type d'examen</label>
                <select
                  className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none font-bold text-slate-700"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="analysis">Analyse Médicale</option>
                  <option value="imaging">Imagerie (Radio, Scanner, IRM...)</option>
                </select>
             </div>
             <div className="relative">
                 <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nom de l'examen</label>
                 <input
                   required
                   type="text"
                   placeholder="ex: FNS, Vitamine D, Scanner Abdo"
                   className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none font-bold text-slate-700"
                   value={formData.sub_type || ''}
                   onChange={e => { setFormData({ ...formData, sub_type: e.target.value }); setShowExamSuggestions(true); }}
                   onFocus={() => setShowExamSuggestions(true)}
                   onBlur={() => setTimeout(() => setShowExamSuggestions(false), 200)}
                 />
                 {showExamSuggestions && examLibrary.length > 0 && (formData.sub_type?.length || 0) > 0 && (
                   <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-40 overflow-auto">
                     {examLibrary.filter(e => e.name.toLowerCase().includes((formData.sub_type || '').toLowerCase())).map(e => (
                       <button key={e.id} type="button" onMouseDown={() => {
                         const mappedType = e.type === 'Radiologie' ? 'imaging' : 'analysis';
                         setFormData({ ...formData, sub_type: e.name, type: mappedType });
                         setShowExamSuggestions(false);
                       }}
                         className="w-full text-left px-4 py-2.5 text-xs font-extrabold text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0 uppercase flex items-center justify-between">
                         <span>{e.name}</span>
                         <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ml-2 shrink-0",
                           e.type === 'Radiologie' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                         )}>{e.type}</span>
                       </button>
                     ))}
                   </div>
                 )}
              </div>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Indication Médicale</label>
             <textarea
               rows={2}
               className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none resize-none text-slate-700 italic"
               placeholder="Pourquoi cet examen est-il demandé ?"
               value={formData.indication || ''}
               onChange={e => setFormData({ ...formData, indication: e.target.value })}
             />
          </div>

          {initialData && (
            <div className="pt-4 border-t border-slate-100">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center gap-2">
                <FileSearch size={16} className="text-emerald-500" />
                Rapport Médical / Résultats
              </h4>
              <div className="space-y-4">
                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Laboratoire / Centre d'imagerie</label>
                   <input
                     type="text"
                     className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none text-slate-700 font-medium"
                     value={formData.provider || ''}
                     onChange={e => setFormData({ ...formData, provider: e.target.value })}
                   />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Résultats / Rapport</label>
                   <textarea
                     rows={4}
                     className="w-full px-4 py-2.5 bg-emerald-50/30 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border border-emerald-100 text-slate-700 font-medium"
                     placeholder="Saisissez ici les valeurs ou le compte-rendu de l'examen..."
                     value={formData.result || ''}
                     onChange={e => setFormData({ ...formData, result: e.target.value })}
                   />
                </div>
                <div>
                   <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notes complémentaires</label>
                   <textarea
                     rows={2}
                     className="w-full px-4 py-2.5 bg-slate-50 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border-none resize-none text-slate-700 italic"
                     value={formData.notes || ''}
                     onChange={e => setFormData({ ...formData, notes: e.target.value })}
                   />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
             <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs hover:bg-slate-200 transition-all">{t("cancel")}</button>
             <button type="submit" className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                {initialData ? "Enregistrer Rapport" : "Demander l'examen"}
             </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function MedicalExamCard({ exam, onEdit, onDelete, patient, user }: { exam: MedicalExam, onEdit: () => void, onDelete?: () => void, patient?: any, user?: any, key?: React.Key }) {
  const isCompleted = !!exam.result;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative group overflow-hidden"
    >
      <div className={cn("absolute top-0 left-0 w-1 h-full", isCompleted ? "bg-emerald-500" : "bg-amber-500")} />

      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", isCompleted ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
            {exam.type === 'analysis' ? <Microscope size={20} /> : <ImageIcon size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {exam.type === 'analysis' ? "Analyse Médicale" : "Imagerie Médicale"}
              </p>
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest",
                isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              )}>
                {isCompleted ? "Réalisé" : "Demandé"}
              </span>
              {exam.doctor_name && <span className="text-[10px] font-bold text-slate-400">par {exam.doctor_name}</span>}
            </div>
            <p className="text-lg font-black text-slate-800 uppercase leading-none mt-1">{exam.sub_type}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50 flex items-center gap-1"
          >
            <Edit2 size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">{isCompleted ? "Rapport" : "Rapport"}</span>
          </button>
          <button
            onClick={() => generateExamReportPDF(patient, exam, user)}
            className="text-slate-400 hover:text-emerald-600 transition-colors p-2 rounded-lg hover:bg-emerald-50 flex items-center gap-1"
          >
            <Printer size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Imprimer</span>
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {exam.indication && (
          <div>
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Indication</h5>
            <p className="text-xs text-slate-600 italic leading-relaxed">{exam.indication}</p>
          </div>
        )}

        {isCompleted && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex justify-between items-center mb-2">
              <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rapport de {exam.provider || 'Laboratoire'}</h5>
              <p className="text-[10px] font-bold text-slate-400">{format(new Date(exam.date), "dd/MM/yyyy")}</p>
            </div>
            <p className="text-sm text-slate-800 font-bold whitespace-pre-wrap">{exam.result}</p>
          </div>
        )}
        {exam.notes && (
          <div>
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes Additionnelles</h5>
            <p className="text-xs text-slate-500 italic leading-relaxed">{exam.notes}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MedicalRecordsPage({ onPatientClick }: { onPatientClick: (id: number) => void }) {
  const { t } = useTranslation();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPatients().then(setPatients).finally(() => setLoading(false));
  }, []);

  const filtered = patients.filter(p =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.id.toString().includes(searchTerm)
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
              <ClipboardList className="text-blue-600" size={28} />
              {t("medical_records_title")}
            </h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">{t("medical_records_subtitle")}</p>
          </div>
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={t("search_record_placeholder")}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border-none outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
          {filtered.map(patient => (
            <button
              key={patient.id}
              onClick={() => onPatientClick(patient.id)}
              className="flex flex-col p-6 bg-slate-50 rounded-3xl hover:bg-white hover:shadow-xl hover:shadow-blue-50 transition-all border border-transparent hover:border-blue-100 text-left group"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-100 group-hover:scale-110 transition-transform">
                  {patient.last_name[0]}{patient.first_name[0]}
                </div>
                <div>
                  <p className="font-black text-slate-800 uppercase tracking-tight leading-tight">{patient.last_name} {patient.first_name}</p>
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-0.5">#{patient.id.toString().padStart(6, '0')}</p>
                  {(patient as any).access_role === 'shared' && (patient as any).share_reason && (
                    <p className={cn(
                      "text-xs font-bold mt-1 flex items-center gap-1.5",
                      (patient as any).share_priority === 'very_urgent' ? 'text-red-600' :
                      (patient as any).share_priority === 'urgent' ? 'text-orange-500' : 'text-emerald-600'
                    )}>
                      <span className={cn(
                        "w-2 h-2 rounded-full inline-block",
                        (patient as any).share_priority === 'very_urgent' ? 'bg-red-600' :
                        (patient as any).share_priority === 'urgent' ? 'bg-orange-500' : 'bg-emerald-600'
                      )} />
                      {(patient as any).share_reason}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-auto pt-4 border-t border-slate-200/50 w-full">
                {(patient as any).access_role === 'shared' && (
                  <span className={cn(
                    "px-2 py-1 text-[10px] font-black rounded uppercase tracking-tighter border flex items-center gap-1",
                    (patient as any).share_priority === 'very_urgent' ? 'bg-red-50 text-red-600 border-red-200' :
                    (patient as any).share_priority === 'urgent' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                    'bg-indigo-50 text-indigo-600 border-indigo-100'
                  )}>
                    <Share2 size={10} /> {t("shared_badge")}
                  </span>
                )}
                <span className="px-2 py-1 bg-white text-[10px] font-black text-slate-500 rounded uppercase tracking-tighter border border-slate-100">
                  {patient.gender === 'male' ? 'H' : 'F'} • {patient.blood_group || 'Gr: -'}
                </span>
                <span className="px-2 py-1 bg-emerald-50 text-[10px] font-black text-emerald-600 rounded uppercase tracking-tighter border border-emerald-100 ml-auto">
                   {t("view_record")}
                </span>
              </div>
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-400 italic">
               {t("no_records_found")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsPage({ theme, setTheme, fontSize, setFontSize }: { theme: Theme, setTheme: (t: Theme) => void, fontSize: FontSize, setFontSize: (f: FontSize) => void }) {
  const { t } = useTranslation();
  const [meds, setMeds] = useState<MedicationLibrary[]>([]);
  const [newMed, setNewMed] = useState<Partial<MedicationLibrary>>({ name: '', dosage: '', unit: '', packaging: '', dci: '', form: '', abbreviation: '', posology: '', classe: '' });
  const [medicationSearch, setMedicationSearch] = useState('');
  const [dciInteractions, setDciInteractions] = useState<DciInteraction[]>([]);
  const [newDciInteraction, setNewDciInteraction] = useState({ dci1: '', dci2: '', severity: 'moderate', description: 'surveillance' });
  const [paraclinicalExams, setParaclinicalExams] = useState<ParaclinicalExam[]>([]);
  const [consultationMotifs, setConsultationMotifs] = useState<SimpleListItem[]>([]);
  const [diagnoses, setDiagnoses] = useState<SimpleListItem[]>([]);
  const [newParaclinicalExam, setNewParaclinicalExam] = useState('');
  const [newParaclinicalExamType, setNewParaclinicalExamType] = useState('Biologie');
  const [newDiagnosis, setNewDiagnosis] = useState('');
  const [newConsultationMotif, setNewConsultationMotif] = useState('');
  const [importing, setImporting] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [excelData, setExcelData] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importingExcel, setImportingExcel] = useState(false);
  const MEDICATION_FIELDS = ['name', 'dosage', 'unit', 'packaging', 'dci', 'form', 'abbreviation', 'posology', 'classe'] as const;
  const FIELD_LABELS: Record<string, string> = { name: 'Nom *', dosage: 'Dosage', unit: 'Unité', packaging: 'Conditionnement', dci: 'DCI', form: 'Forme', abbreviation: 'Abréviation', posology: 'Posologie', classe: 'Classe' };
  const [prescriptionTemplate, setPrescriptionTemplate] = useState(() => {
    try { return JSON.parse(localStorage.getItem('medicab_prescription_template') || '{}'); }
    catch { return {}; }
  });
  const [activeTab, setActiveTab] = useState('appearance');
  const [importingExam, setImportingExam] = useState(false);
  const [importingDiagnosis, setImportingDiagnosis] = useState(false);
  const [importingMotif, setImportingMotif] = useState(false);
  const [workingHours, setWorkingHours] = useState<{ day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]>([]);
  const [workingHoursLoading, setWorkingHoursLoading] = useState(false);
  const [workingHoursSaved, setWorkingHoursSaved] = useState(false);

  const dayNames = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  const loadWorkingHours = async () => {
    try {
      const data = await api.getWorkingHours();
      const defaultHours = [
        { day_of_week: 1, start_time: '08:00', end_time: '17:00', is_available: true },
        { day_of_week: 2, start_time: '08:00', end_time: '17:00', is_available: true },
        { day_of_week: 3, start_time: '08:00', end_time: '17:00', is_available: true },
        { day_of_week: 4, start_time: '08:00', end_time: '17:00', is_available: true },
        { day_of_week: 5, start_time: '08:00', end_time: '17:00', is_available: true },
        { day_of_week: 6, start_time: '09:00', end_time: '13:00', is_available: false },
        { day_of_week: 0, start_time: '09:00', end_time: '13:00', is_available: false },
      ];
      if (data && data.length > 0) {
        const mapped = data.map((d: any) => ({
          day_of_week: d.day_of_week,
          start_time: d.start_time?.slice(0, 5) || '08:00',
          end_time: d.end_time?.slice(0, 5) || '17:00',
          is_available: d.is_available,
        }));
        defaultHours.forEach(def => {
          if (!mapped.find((m: any) => m.day_of_week === def.day_of_week)) {
            mapped.push(def);
          }
        });
        setWorkingHours(mapped);
      } else {
        setWorkingHours(defaultHours);
      }
    } catch { setWorkingHours([]); }
  };

  const handleWorkingHourChange = (day_of_week: number, field: string, value: string | boolean) => {
    setWorkingHours(prev => prev.map(h => h.day_of_week === day_of_week ? { ...h, [field]: value } : h));
  };

  const saveWorkingHours = async () => {
    setWorkingHoursLoading(true);
    setWorkingHoursSaved(false);
    try {
      await api.setWorkingHours(workingHours);
      setWorkingHoursSaved(true);
      setTimeout(() => setWorkingHoursSaved(false), 3000);
    } catch (err) { console.error(err); }
    finally { setWorkingHoursLoading(false); }
  };

  useEffect(() => {
    api.getUserSettings().then(saved => {
      if (saved && typeof saved === 'object' && Object.keys(saved).length > 0) {
        if (saved.theme && ['light', 'dark', 'night', 'medical', 'duo', 'moderne'].includes(saved.theme)) {
          setTheme(saved.theme);
        }
        if (saved.fontSize && ['small', 'medium', 'large'].includes(saved.fontSize)) {
          setFontSize(saved.fontSize);
        }
        const { theme: _, fontSize: __, ...template } = saved;
        setPrescriptionTemplate(template);
        localStorage.setItem('medicab_prescription_template', JSON.stringify(template));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadMeds();
    loadParaclinicalExams();
    loadDiagnoses();
    loadConsultationMotifs();
    loadDciInteractions();
    loadWorkingHours();
  }, []);

  const loadMeds = async () => {
    try {
      const data = await api.getMedicationsLibrary();
      setMeds(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadParaclinicalExams = async () => {
    try { setParaclinicalExams(await api.getParaclinicalExams()); } catch {}
  };
  const loadDiagnoses = async () => {
    try { setDiagnoses(await api.getDiagnoses()); } catch {}
  };
  const loadConsultationMotifs = async () => {
    try { setConsultationMotifs(await api.getConsultationMotifs()); } catch {}
  };
  const loadDciInteractions = async () => {
    try { setDciInteractions(await api.getDciInteractions()); } catch {}
  };
  const handleAddDciInteraction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDciInteraction.dci1.trim() || !newDciInteraction.dci2.trim() || newDciInteraction.dci1.trim().toLowerCase() === newDciInteraction.dci2.trim().toLowerCase()) return;
    try {
      await api.createDciInteraction({ dci1: newDciInteraction.dci1.trim(), dci2: newDciInteraction.dci2.trim(), severity: newDciInteraction.severity, description: newDciInteraction.description });
      setNewDciInteraction({ dci1: '', dci2: '', severity: 'moderate', description: 'surveillance' });
      loadDciInteractions();
    } catch (err) { console.error(err); }
  };
  const handleDeleteDciInteraction = async (id: number) => {
    try { await api.deleteDciInteraction(id); loadDciInteractions(); }
    catch (err) { console.error(err); }
  };

  const handleAddMed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMed.name) return;
    try {
      await api.createMedicationLibrary(newMed);
      setNewMed({ name: '', dosage: '', unit: '', packaging: '', dci: '', form: '', abbreviation: '', posology: '', classe: '' });
      loadMeds();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMed = async (id: number) => {
    if (confirm(t("delete_med_confirm"))) {
      try {
        await api.deleteMedicationLibrary(id);
        loadMeds();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleSimpleListCSV = async (e: React.ChangeEvent<HTMLInputElement>, type: 'exam' | 'analysis' | 'motif' | 'diagnosis', setLoading: (v: boolean) => void, loader: () => Promise<void>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const buffer = await file.arrayBuffer();
    let text: string;
    try {
      text = new TextDecoder("UTF-8", { fatal: true }).decode(buffer);
    } catch {
      text = new TextDecoder("ISO-8859-1").decode(buffer);
    }
    const firstLine = text.split('\n')[0] || '';
    const delimiter = firstLine.includes(';') ? ';' : ',';
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      delimiter,
      complete: async (results) => {
        try {
          let count = 0, errors: string[] = [];
          for (const row of results.data as any[]) {
            const name = (row.name || row.Name || row.NOM || row.nom || row.analyse || row.examen || row.motif || '').trim();
            if (!name) continue;
            try {
              if (type === 'exam') {
                const examType = (row.type || row.Type || row.TYPE || row.categorie || 'Biologie').trim();
                await api.createParaclinicalExam(name, examType);
              } else if (type === 'analysis') await api.createLabAnalysis(name);
              else if (type === 'motif') await api.createConsultationMotif(name);
              else if (type === 'diagnosis') await api.createDiagnosis(name);
              count++;
            } catch (e: any) {
              if (e?.message?.includes('unique') || e?.message?.includes('UNIQUE') || e?.message?.includes('duplicate')) {
                errors.push(`"${name}" existe déjà`);
              } else {
                errors.push(`"${name}": ${e?.message || e}`);
              }
            }
          }
          if (count > 0) alert(`${count} élément(s) importé(s).${errors.length ? `\n${errors.length} ignoré(s) : ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}` : ''}`);
          else if (errors.length > 0) alert(`Aucun importé. Erreurs : ${errors.slice(0, 3).join(', ')}${errors.length > 3 ? '...' : ''}`);
          else alert("Aucune ligne valide trouvée dans le CSV.");
          await loader();
        } catch (err) {
          console.error(err);
          alert(t("import_error"));
        } finally {
          setLoading(false);
          if (e.target) e.target.value = '';
        }
      }
    });
  };

  const savePrescriptionTemplate = (next: any) => {
    const merged = { ...next, theme, fontSize };
    setPrescriptionTemplate(next);
    localStorage.setItem('medicab_prescription_template', JSON.stringify(next));
    api.saveUserSettings(merged).catch(() => {});
  };

  const updatePrescriptionTemplate = (key: string, value: string) => {
    savePrescriptionTemplate({ ...prescriptionTemplate, [key]: value });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const formattedMeds = results.data.map((row: any) => ({
            name: row.name || row.Name || row.NOM || row.nom,
            dosage: row.dosage || row.Dosage || row.DOSAGE,
            unit: row.unit || row.UNIT,
            packaging: row.packaging || row.PACKAGING,
            dci: row.dci || row.DCI,
            form: row.form || row.Form || row.FORME,
            abbreviation: row.abbreviation || row.ABBREVIATION || row.ABREVIATION,
            posology: row.posology || row.Posology || row.POSOLOGIE,
            classe: row.classe || row.Classe || row.CLASSE
          })).filter(m => !!m.name);

          await api.importMedicationsBulk(formattedMeds);
          alert(`${formattedMeds.length} ${t("import_success")}`);
          loadMeds();
        } catch (err) {
          console.error(err);
          alert(t("import_error"));
        } finally {
          setImporting(false);
          if (e.target) e.target.value = '';
        }
      }
    });
  };

  const handleExcelSelect = (file: File) => {
    setImportingExcel(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
        if (!json.length) { alert("Le fichier est vide."); setImportingExcel(false); return; }
        const headers = Object.keys(json[0]);
        // Auto-detect mapping
        const autoMap: Record<string, string> = {};
        const fieldSynonyms: Record<string, string[]> = {
          name: ['name', 'nom', 'medicament', 'médicament', 'libelle', 'libellé', 'produit', 'drug'],
          dosage: ['dosage', 'dose', 'dos', 'strength'],
          unit: ['unit', 'unite', 'unité', 'unité de mesure', 'u'],
          packaging: ['packaging', 'conditionnement', 'pack', 'emballage', 'boite', 'boîte', 'bte'],
          dci: ['dci', 'denomination', 'dénomination', 'substance', 'active', 'principe actif'],
          form: ['form', 'forme', 'forme pharmaceutique', 'formulation', 'galenique', 'galénique'],
          abbreviation: ['abbreviation', 'abreviation', 'abréviation', 'abr', 'sigle', 'code'],
          posology: ['posology', 'posologie', 'poso', 'dosage recommandé'],
          classe: ['classe', 'class', 'classe thérapeutique', 'therapeutic', 'catégorie', 'famille']
        };
        headers.forEach(h => {
          const hLower = h.toLowerCase().trim().normalize('NFC');
          for (const [field, synonyms] of Object.entries(fieldSynonyms)) {
            if (synonyms.some(s => hLower === s || hLower.includes(s) || s.includes(hLower))) {
              if (!Object.values(autoMap).includes(field)) autoMap[h] = field;
              break;
            }
          }
        });
        setColumnMapping(autoMap);
        setExcelData({ headers, rows: json });
        setShowExcelImport(true);
      } catch (err) {
        console.error(err);
        alert("Erreur lors de la lecture du fichier Excel.");
      } finally {
        setImportingExcel(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExcelImport = async () => {
    if (!excelData) return;
    const fieldToHeader = Object.fromEntries(Object.entries(columnMapping).map(([h, f]) => [f, h]));
    if (!fieldToHeader.name) { alert("Le champ 'Nom' doit être mappé."); return; }
    setImportingExcel(true);
    try {
      const formattedMeds = excelData.rows.map(row => {
        const med: Record<string, string> = {};
        MEDICATION_FIELDS.forEach(f => {
          const header = fieldToHeader[f];
          if (header) med[f] = (row[header] || '').toString().trim();
        });
        return med as Partial<MedicationLibrary>;
      }).filter(m => !!m.name);
      if (!formattedMeds.length) { alert("Aucun médicament valide trouvé."); setImportingExcel(false); return; }
      await api.importMedicationsBulk(formattedMeds);
      alert(`${formattedMeds.length} médicament(s) importé(s) avec succès.`);
      setShowExcelImport(false);
      setExcelData(null);
      loadMeds();
    } catch (err) {
      console.error(err);
      alert("Erreur lors de l'importation.");
    } finally {
      setImportingExcel(false);
    }
  };

  const tabs = [
    { id: 'appearance', label: t('settings_appearance'), icon: Sun },
    { id: 'ordonnances', label: t('settings_ordonnances'), icon: Printer },
    { id: 'medications', label: t('settings_medications'), icon: ClipboardList },
    { id: 'exams', label: t('settings_exams'), icon: Activity },
    { id: 'diagnoses', label: t('settings_diagnoses'), icon: Edit2 },
    { id: 'motifs', label: t('settings_motifs'), icon: Edit2 },
    { id: 'dciInteractions', label: 'Interactions (DCI)', icon: AlertTriangle },
    { id: 'workingHours', label: 'Horaires', icon: Clock },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-6xl mx-auto pb-20">
      {/* Tab Bar */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-2 mb-8 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-3 rounded-xl font-extrabold text-xs uppercase tracking-widest transition-all whitespace-nowrap",
                  activeTab === tab.id ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "text-slate-400 hover:text-slate-700 hover:bg-slate-50"
                )}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'appearance' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 max-w-xl space-y-8">
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
              <Sun className="text-blue-600" /> {t("appearance_title")}
            </h3>
            <p className="text-sm text-slate-500 font-medium mt-1">{t("appearance_desc")}</p>
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-4">{t("theme_label")}</label>
            <div className="grid grid-cols-1 gap-3">
              {[
                { id: 'light', label: t('theme_light'), icon: Sun, desc: t('theme_light_desc') },
                { id: 'dark', label: t('theme_dark'), icon: Moon, desc: t('theme_dark_desc') },
                { id: 'night', label: t('theme_night'), icon: Moon, desc: t('theme_night_desc') },
                { id: 'medical', label: t('theme_medical'), icon: Stethoscope, desc: t('theme_medical_desc') },
                { id: 'duo', label: t('theme_duo'), icon: Palette, desc: t('theme_duo_desc') },
                { id: 'moderne', label: t('theme_moderne'), icon: Sparkles, desc: t('theme_moderne_desc') },
              ].map((th) => (
                <button key={th.id} onClick={() => setTheme(th.id as Theme)}
                  className={cn("flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                    theme === th.id ? "border-blue-600 bg-blue-50/50 shadow-sm" : "border-slate-100 opacity-60 hover:opacity-100"
                  )}>
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    theme === th.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"
                  )}><th.icon size={20} /></div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-tight text-slate-800">{th.label}</p>
                    <p className="text-[10px] text-slate-500 font-medium">{th.desc}</p>
                  </div>
                  {theme === th.id && <Check size={16} className="ml-auto text-blue-600" />}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-4">{t("font_size")}</label>
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
              {[
                { id: 'small', label: t('font_small') },
                { id: 'medium', label: t('font_medium') },
                { id: 'large', label: t('font_large') },
              ].map((f) => (
                <button key={f.id} onClick={() => setFontSize(f.id as FontSize)}
                  className={cn("py-3 px-2 rounded-xl font-black uppercase tracking-tighter transition-all text-[10px]",
                    fontSize === f.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}>{f.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ordonnances' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 max-w-xl">
          <div className="mb-6">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
              <Printer className="text-blue-600" /> {t("ordonnances_title")}
            </h3>
            <p className="text-sm text-slate-500 font-medium mt-1">{t("ordonnances_desc")}</p>
          </div>
          <div className="space-y-3">
            {[
              ['header', t('template_header')], ['logo', t('template_logo')], ['footer', t('template_footer')], ['signature', t('template_signature')], ['printTop', t('template_print_top')], ['printBottom', t('template_print_bottom')], ['marginTop', t('template_margin_top')], ['marginLeft', t('template_margin_left')], ['marginRight', t('template_margin_right')]
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</label>
                <input type={key.toLowerCase().includes('margin') || key.startsWith('print') ? 'number' : 'text'}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  value={prescriptionTemplate[key] || ''}
                  onChange={e => updatePrescriptionTemplate(key, e.target.value)} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("template_format")}</label>
                <select className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 text-sm font-bold text-slate-700" value={prescriptionTemplate.format || 'a4'} onChange={e => updatePrescriptionTemplate('format', e.target.value)}>
                  <option value="a4">{t("format_a4")}</option>
                  <option value="a5">{t("format_a5")}</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("template_orientation")}</label>
                <select className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-100 text-sm font-bold text-slate-700" value={prescriptionTemplate.orientation || 'portrait'} onChange={e => updatePrescriptionTemplate('orientation', e.target.value)}>
                  <option value="portrait">{t("orientation_portrait")}</option>
                  <option value="landscape">{t("orientation_landscape")}</option>
                </select>
              </div>
            </div>
            <button type="button" onClick={() => savePrescriptionTemplate({})} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest">{t("template_reset")}</button>
          </div>
        </div>
      )}

      {activeTab === 'medications' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-8">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
              <ClipboardList className="text-blue-600" size={28} /> {t("medications_library")}
            </h3>
          </div>
          <form onSubmit={handleAddMed} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-8 bg-slate-50 rounded-2xl border border-slate-200/50 shadow-inner">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_name")}</label>
              <input required type="text" placeholder={t("medication_name_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={newMed.name} onChange={e => setNewMed({...newMed, name: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_dosage")}</label>
              <input type="text" placeholder={t("medication_dosage_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-600" value={newMed.dosage} onChange={e => setNewMed({...newMed, dosage: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_unit")}</label>
              <input type="text" placeholder={t("medication_unit_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.unit || ''} onChange={e => setNewMed({...newMed, unit: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_packaging")}</label>
              <input type="text" placeholder={t("medication_packaging_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.packaging || ''} onChange={e => setNewMed({...newMed, packaging: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_dci")}</label>
              <input type="text" placeholder={t("medication_dci_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.dci || ''} onChange={e => setNewMed({...newMed, dci: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_classe")}</label>
              <input type="text" placeholder={t("medication_classe_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.classe || ''} onChange={e => setNewMed({...newMed, classe: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_form")}</label>
              <input type="text" placeholder={t("medication_form_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.form} onChange={e => setNewMed({...newMed, form: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">{t("medication_abbreviation")}</label>
              <input type="text" placeholder={t("medication_abbreviation_placeholder")} className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.abbreviation || ''} onChange={e => setNewMed({...newMed, abbreviation: e.target.value})} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="w-full h-[52px] bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 uppercase tracking-widest text-xs">
                <Plus size={18} /> {t("add_medication")}
              </button>
            </div>
          </form>
          <div className="flex items-center gap-3 mb-3">
            <Search size={18} className="text-slate-400 shrink-0" />
            <input type="text" value={medicationSearch} onChange={e => setMedicationSearch(e.target.value)} placeholder={t("medication_name_placeholder") || "Rechercher un médicament..."} className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 text-xs" />
            {medicationSearch && <button type="button" onClick={() => setMedicationSearch('')} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>}
          </div>
          <div className="overflow-hidden bg-white rounded-2xl border border-slate-100 shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-4">{t("medication_name")}</th>
                  <th className="px-4 py-4">{t("medication_dosage")}</th>
                  <th className="px-4 py-4">{t("medication_unit")}</th>
                  <th className="px-4 py-4">{t("medication_packaging")}</th>
                  <th className="px-4 py-4">{t("medication_dci")}</th>
                  <th className="px-4 py-4">{t("medication_classe")}</th>
                  <th className="px-4 py-4">{t("medication_form")}</th>
                  <th className="px-4 py-4">{t("medication_abbreviation")}</th>
                  <th className="px-4 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(medicationSearch ? meds.filter(m => [m.name, m.dci, m.classe, m.form, m.dosage, m.abbreviation, m.unit, m.packaging].some(v => v?.toLowerCase().includes(medicationSearch.toLowerCase()))) : meds).map(m => (
                  <tr key={m.id} className="hover:bg-blue-50/20 transition-colors group">
                    <td className="px-4 py-4"><p className="font-extrabold text-slate-800 uppercase tracking-tight text-xs">{m.name}</p></td>
                    <td className="px-4 py-4"><span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">{m.dosage || "-"}</span></td>
                    <td className="px-4 py-4 text-[10px] text-slate-500 font-medium">{m.unit || "-"}</td>
                    <td className="px-4 py-4 text-[10px] text-slate-500 font-medium">{m.packaging || "-"}</td>
                    <td className="px-4 py-4 text-[10px] text-slate-500 font-medium">{m.dci || "-"}</td>
                    <td className="px-4 py-4"><span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold">{m.classe || "-"}</span></td>
                    <td className="px-4 py-4 text-[10px] text-slate-500 font-medium">{m.form || "-"}</td>
                    <td className="px-4 py-4 text-[10px] text-slate-500 font-medium">{m.abbreviation || "-"}</td>
                    <td className="px-4 py-4">
                      <button onClick={() => handleDeleteMed(m.id)} className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"><X size={16} /></button>
                    </td>
                  </tr>
                ))}
                {meds.length === 0 && !medicationSearch && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-slate-400 italic bg-slate-50/50">
                      <div className="flex flex-col items-center gap-2">
                        <Search size={32} strokeWidth={1} />
                        <p>{t("empty_library")}</p>
                        <p className="text-[10px] font-bold uppercase not-italic">{t("empty_library_hint")}</p>
                      </div>
                    </td>
                  </tr>
                )}
                {meds.length > 0 && medicationSearch && meds.filter(m => [m.name, m.dci, m.classe, m.form, m.dosage, m.abbreviation, m.unit, m.packaging].some(v => v?.toLowerCase().includes(medicationSearch.toLowerCase()))).length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-16 text-center text-slate-400 italic bg-slate-50/50">
                      <div className="flex flex-col items-center gap-2">
                        <Search size={32} strokeWidth={1} />
                        <p>Aucun résultat pour "{medicationSearch}"</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'exams' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
              <Activity className="text-blue-600" size={24} /> {t("exam_list_title")}
            </h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl cursor-pointer hover:bg-emerald-100 transition shadow-sm font-bold text-xs">
                <FilePlus size={18} /> {importingExam ? t("importing") : t("import_csv")}
                <input type="file" accept=".csv" className="hidden" onChange={e => handleSimpleListCSV(e, 'exam', setImportingExam, loadParaclinicalExams)} disabled={importingExam} />
              </label>
              <button onClick={async () => { if (!confirm(t("reset_confirm_exams"))) return; try { await api.resetParaclinicalExams(); loadParaclinicalExams(); } catch { alert(t("error")); } }} className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition shadow-sm font-bold text-[10px] uppercase tracking-wider"><X size={15} /> {t("reset")}</button>
            </div>
          </div>
          <form onSubmit={async (e) => { e.preventDefault(); if (!newParaclinicalExam.trim()) return; try { await api.createParaclinicalExam(newParaclinicalExam.trim(), newParaclinicalExamType); setNewParaclinicalExam(''); loadParaclinicalExams(); } catch { alert(t("error")); } }} className="flex gap-3">
            <input type="text" placeholder={t("exam_name_field")} className="flex-1 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 text-sm" value={newParaclinicalExam} onChange={e => setNewParaclinicalExam(e.target.value)} />
            <select className="px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none" value={newParaclinicalExamType} onChange={e => setNewParaclinicalExamType(e.target.value)}>
              <option value="Biologie">{t("exam_type_biology")}</option>
              <option value="Radiologie">{t("exam_type_radiology")}</option>
              <option value="Autre">{t("exam_type_other")}</option>
            </select>
            <button type="submit" className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-blue-700 shadow-lg shadow-blue-100">{t("add_medication")}</button>
          </form>
          <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
            <p className="text-[10px] font-bold text-blue-700">{t("csv_format_exam")} : <span className="font-mono">name;type</span></p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">{t("csv_example_exam")}</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("exam_name")}</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("exam_type")}</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("delete")}</th>
                </tr>
              </thead>
              <tbody>
                {paraclinicalExams.map(e => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-800">{e.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                        e.type === 'Radiologie' ? 'bg-amber-100 text-amber-700' : e.type === 'Autre' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                      )}>{e.type}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={async () => { try { await api.deleteParaclinicalExam(e.id); loadParaclinicalExams(); } catch { alert(t("error")); } }} className="text-slate-300 hover:text-red-500 p-1"><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {paraclinicalExams.length === 0 && <div className="p-8 text-center text-slate-400 italic">{t("no_exams_defined")}</div>}
          </div>
        </div>
      )}

      {activeTab === 'diagnoses' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
              <Edit2 className="text-emerald-600" size={24} /> {t("diagnosis_list_title")}
            </h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl cursor-pointer hover:bg-emerald-100 transition shadow-sm font-bold text-xs">
                <FilePlus size={18} /> {importingDiagnosis ? t("importing") : t("import_csv")}
                <input type="file" accept=".csv" className="hidden" onChange={e => handleSimpleListCSV(e, 'diagnosis', setImportingDiagnosis, loadDiagnoses)} disabled={importingDiagnosis} />
              </label>
              <button onClick={async () => { if (!confirm(t("reset_confirm_diagnoses"))) return; try { await api.resetDiagnoses(); loadDiagnoses(); } catch { alert(t("error")); } }} className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition shadow-sm font-bold text-[10px] uppercase tracking-wider"><X size={15} /> {t("reset")}</button>
            </div>
          </div>
          <form onSubmit={async (e) => { e.preventDefault(); if (!newDiagnosis.trim()) return; try { await api.createDiagnosis(newDiagnosis.trim()); setNewDiagnosis(''); loadDiagnoses(); } catch { alert(t("error")); } }} className="flex gap-3">
            <input type="text" placeholder={t("diagnosis_name_field")} className="flex-1 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 text-sm" value={newDiagnosis} onChange={e => setNewDiagnosis(e.target.value)} />
            <button type="submit" className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-emerald-700 shadow-lg shadow-emerald-100">{t("add_medication")}</button>
          </form>
          <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-700">{t("csv_format_diagnosis")} : <span className="font-mono">name</span></p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">{t("csv_example_diagnosis")}</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("medication_name")}</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("delete")}</th>
                </tr>
              </thead>
              <tbody>
                {diagnoses.map(d => (
                  <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-800">{d.name}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={async () => { try { await api.deleteDiagnosis(d.id); loadDiagnoses(); } catch { alert(t("error")); } }} className="text-slate-300 hover:text-red-500 p-1"><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {diagnoses.length === 0 && <div className="p-8 text-center text-slate-400 italic">{t("no_diagnoses_defined")}</div>}
          </div>
        </div>
      )}

      {activeTab === 'motifs' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
              <Edit2 className="text-purple-600" size={24} /> {t("motif_list_title")}
            </h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl cursor-pointer hover:bg-emerald-100 transition shadow-sm font-bold text-xs">
                <FilePlus size={18} /> {importingMotif ? t("importing") : t("import_csv")}
                <input type="file" accept=".csv" className="hidden" onChange={e => handleSimpleListCSV(e, 'motif', setImportingMotif, loadConsultationMotifs)} disabled={importingMotif} />
              </label>
              <button onClick={async () => { if (!confirm(t("reset_confirm_motifs"))) return; try { await api.resetConsultationMotifs(); loadConsultationMotifs(); } catch { alert(t("error")); } }} className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition shadow-sm font-bold text-[10px] uppercase tracking-wider"><X size={15} /> {t("reset")}</button>
            </div>
          </div>
          <form onSubmit={async (e) => { e.preventDefault(); if (!newConsultationMotif.trim()) return; try { await api.createConsultationMotif(newConsultationMotif.trim()); setNewConsultationMotif(''); loadConsultationMotifs(); } catch { alert(t("error")); } }} className="flex gap-3">
            <input type="text" placeholder={t("motif_name_field")} className="flex-1 px-4 py-2.5 bg-slate-50 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500 font-bold text-slate-700 text-sm" value={newConsultationMotif} onChange={e => setNewConsultationMotif(e.target.value)} />
            <button type="submit" className="px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-purple-700 shadow-lg shadow-purple-100">{t("add_medication")}</button>
          </form>
          <div className="p-4 bg-purple-50/50 rounded-xl border border-purple-100">
            <p className="text-[10px] font-bold text-purple-700">{t("csv_format_motif")} : <span className="font-mono">name</span></p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">{t("csv_example_motif")}</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("medication_name")}</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">{t("delete")}</th>
                </tr>
              </thead>
              <tbody>
                {consultationMotifs.map(m => (
                  <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-bold text-slate-800">{m.name}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={async () => { try { await api.deleteConsultationMotif(m.id); loadConsultationMotifs(); } catch { alert(t("error")); } }} className="text-slate-300 hover:text-red-500 p-1"><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {consultationMotifs.length === 0 && <div className="p-8 text-center text-slate-400 italic">{t("no_motifs_defined")}</div>}
          </div>
        </div>
      )}

      {activeTab === 'dciInteractions' && (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-3">
              <AlertTriangle className="text-amber-600" size={24} /> Interactions par DCI
            </h3>
          </div>
          <form onSubmit={handleAddDciInteraction} className="flex flex-wrap gap-3 items-end p-6 bg-slate-50 rounded-2xl border border-slate-200/50">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">DCI 1</label>
              <input required type="text" list="dci-list-1" placeholder="ex: Amoxicilline" className="px-3 py-2.5 bg-white rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none min-w-[160px]" value={newDciInteraction.dci1} onChange={e => setNewDciInteraction({...newDciInteraction, dci1: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">DCI 2</label>
              <input required type="text" list="dci-list-2" placeholder="ex: Ibuprofène" className="px-3 py-2.5 bg-white rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none min-w-[160px]" value={newDciInteraction.dci2} onChange={e => setNewDciInteraction({...newDciInteraction, dci2: e.target.value})} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">{t("interaction_severity")}</label>
              <select className="px-3 py-2.5 bg-white rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none" value={newDciInteraction.severity} onChange={e => setNewDciInteraction({...newDciInteraction, severity: e.target.value})}>
                <option value="mineur">Mineur</option>
                <option value="moderate">Modéré</option>
                <option value="majeur">Majeur</option>
                <option value="contre_indication">Contre-indication</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">{t("interaction_description")}</label>
              <select className="px-3 py-2.5 bg-white rounded-xl border border-slate-200 text-sm font-bold text-slate-700 outline-none" value={newDciInteraction.description} onChange={e => setNewDciInteraction({...newDciInteraction, description: e.target.value})}>
                <option value="interaction_faible">Faible</option>
                <option value="surveillance">Surveillance</option>
                <option value="eviter_association">Éviter</option>
                <option value="interdiction">Interdit</option>
              </select>
            </div>
            <button type="submit" className="px-5 py-2.5 bg-amber-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider hover:bg-amber-700 shadow-lg shadow-amber-100">Ajouter</button>
          </form>
          <div className="space-y-2">
            {dciInteractions.map(di => {
              const severityColors: Record<string, string> = {
                mineur: 'bg-blue-100 text-blue-700 border-blue-200',
                moderate: 'bg-orange-100 text-orange-700 border-orange-200',
                majeur: 'bg-red-100 text-red-700 border-red-200',
                contre_indication: 'bg-red-800 text-white border-red-900'
              };
              return (
                <div key={di.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={20} className="text-amber-500 shrink-0" />
                    <div>
                      <p className="font-bold text-slate-800 text-sm"><span className="text-amber-700">{di.dci1}</span> ↔ <span className="text-amber-700">{di.dci2}</span></p>
                      <div className="flex gap-2 mt-1">
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border", severityColors[di.severity] || 'bg-slate-100 text-slate-600')}>{di.severity === 'mineur' ? 'Mineur' : di.severity === 'moderate' ? 'Modéré' : di.severity === 'majeur' ? 'Majeur' : 'Contre-indication'}</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">{di.description === 'interaction_faible' ? 'Faible' : di.description === 'surveillance' ? 'Surveillance' : di.description === 'eviter_association' ? 'Éviter' : 'Interdit'}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDciInteraction(di.id)} className="text-slate-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50"><X size={16} /></button>
                </div>
              );
            })}
            {dciInteractions.length === 0 && (
              <div className="p-8 text-center text-slate-400 italic bg-slate-50 rounded-2xl">
                <AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />
                <p>Aucune interaction par DCI définie.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'workingHours' && (
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                <Clock className="text-blue-600" /> Horaires d'ouverture
              </h3>
              <p className="text-sm text-slate-500 font-medium mt-1">Personnalisez vos horaires de travail par jour</p>
            </div>
            <button onClick={saveWorkingHours} disabled={workingHoursLoading}
              className={cn("px-5 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex items-center gap-2",
                workingHoursSaved ? "bg-emerald-600 text-white shadow-lg shadow-emerald-100" : "bg-blue-600 text-white shadow-lg shadow-blue-100 hover:bg-blue-700"
              )}>
              {workingHoursLoading ? 'Enregistrement...' : workingHoursSaved ? '✓ Enregistré' : 'Enregistrer'}
            </button>
          </div>
          <div className="space-y-2">
            {[1, 2, 3, 4, 5, 6, 0].map(dow => {
              const h = workingHours.find(w => w.day_of_week === dow);
              if (!h) return null;
              return (
                <div key={dow} className={cn("flex items-center gap-3 p-3 rounded-2xl border transition-all", h.is_available ? "bg-slate-50 border-slate-200" : "bg-red-50/50 border-red-200")}>
                  <div className="w-24 shrink-0">
                    <p className={cn("font-bold text-sm", h.is_available ? "text-slate-800" : "text-red-500")}>{dayNames[dow === 0 ? 6 : dow - 1]}</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={h.is_available} onChange={e => handleWorkingHourChange(dow, 'is_available', e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
                    <span className="text-xs font-semibold text-slate-500">Ouvert</span>
                  </label>
                  {h.is_available && (
                    <div className="flex items-center gap-2 ml-auto">
                      <input type="time" value={h.start_time} onChange={e => handleWorkingHourChange(dow, 'start_time', e.target.value)} className="px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-sm font-bold text-slate-700 outline-none w-28" />
                      <span className="text-slate-400 text-xs font-bold">à</span>
                      <input type="time" value={h.end_time} onChange={e => handleWorkingHourChange(dow, 'end_time', e.target.value)} className="px-2 py-1.5 bg-white rounded-lg border border-slate-200 text-sm font-bold text-slate-700 outline-none w-28" />
                    </div>
                  )}
                  {!h.is_available && (
                    <span className="ml-auto text-xs font-bold text-red-400 uppercase tracking-wider">Fermé</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarView({ appointments, onNavigateToPatient, onBackToList, onRefresh }: { appointments: Appointment[], onNavigateToPatient: (id: number, appointment?: Appointment) => void, onBackToList: () => void, onRefresh: () => void }) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const dayNames = [t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat"), t("sun")];

  const appointmentsByDate: Record<string, Appointment[]> = {};
  appointments.forEach(app => {
    const key = format(new Date(app.date), "yyyy-MM-dd");
    if (!appointmentsByDate[key]) appointmentsByDate[key] = [];
    appointmentsByDate[key].push(app);
  });

  const selectedAppts = selectedDate
    ? appointmentsByDate[format(selectedDate, "yyyy-MM-dd")] || []
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">{t("calendar_title")}</h3>
            <p className="text-sm text-slate-500 font-medium">{t("calendar_subtitle")}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={onRefresh} className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-200">
              <History size={14} />
              {t("refresh")}
            </button>
            <button onClick={onBackToList} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">
              <Calendar size={14} />
              {t("list_view")}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ChevronLeft size={20} className="text-slate-500" />
          </button>
          <h4 className="text-lg font-black text-slate-800 capitalize">
            {format(currentMonth, "MMMM yyyy")}
          </h4>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <ChevronRight size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {dayNames.map(name => (
            <div key={name} className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest py-2">
              {name}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {days.map((day, i) => {
            const key = format(day, "yyyy-MM-dd");
            const dayApps = appointmentsByDate[key] || [];
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);

            return (
              <button
                key={i}
                onClick={() => { if (isCurrentMonth) setSelectedDate(day); }}
                className={cn(
                  "aspect-square rounded-xl flex flex-col items-center justify-center text-sm transition-all relative",
                  !isCurrentMonth && "opacity-30",
                  isSelected && "bg-blue-600 text-white shadow-lg shadow-blue-200",
                  isToday && !isSelected && "bg-blue-50 text-blue-600 font-black border-2 border-blue-200",
                  !isSelected && !isToday && isCurrentMonth && "hover:bg-slate-50 text-slate-700",
                  dayApps.length > 0 && !isSelected && "font-bold"
                )}
              >
                <span>{format(day, "d")}</span>
                {dayApps.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayApps.slice(0, 3).map((_, idx) => (
                      <div key={idx} className={cn("w-1 h-1 rounded-full", isSelected ? "bg-white" : "bg-blue-500")} />
                    ))}
                    {dayApps.length > 3 && (
                      <span className="text-[10px] font-black">{dayApps.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-tighter mb-4">
            {t("appointments_of")} {format(selectedDate, "dd MMMM yyyy")}
          </h4>
          {selectedAppts.length > 0 ? (
            <div className="space-y-3">
              {selectedAppts.map(app => (
                <div key={app.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 transition-colors cursor-pointer group" onClick={() => onNavigateToPatient(app.patient_id, app)}>
                  <div className="flex items-center gap-4">
                    <div className="bg-white p-2.5 rounded-lg shadow-sm text-center min-w-[50px]">
                      <p className="text-xs font-bold text-slate-400">{app.hour?.slice(0, 5)}</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors uppercase">{app.last_name} {app.first_name}</p>
                      <p className="text-xs text-slate-500 italic">"{app.reason}"</p>
                    </div>
                  </div>
                  <span className={cn(
                    "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                    app.status === 'scheduled' ? "bg-blue-100 text-blue-700" : app.status === 'completed' ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                  )}>
                    {app.status === 'scheduled' ? t("scheduled_badge") : app.status === 'completed' ? t("completed_badge") : t("cancelled_badge")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 italic text-sm">{t("no_appointments_day")}</div>
          )}
        </div>
      )}
    </motion.div>
  );
}

function ContactPage() {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState('');
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msg.trim()) return;
    try {
      const res = await fetch('/api/contact/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg }) });
      if (!res.ok) throw new Error("Failed to send");
      setSent(true);
    } catch { alert(t("contact_send_error")); }
  };
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 space-y-6">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-3 rounded-2xl text-white"><MessageCircle size={28} /></div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">{t("contact_title")}</h2>
            <p className="text-sm text-slate-500 font-medium">{t("contact_name_display")}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <Mail className="text-blue-600 shrink-0" size={20} />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("contact_email")}</p>
              <p className="text-sm font-bold text-slate-800">gacemiamine@gmail.com</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <Phone className="text-blue-600 shrink-0" size={20} />
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t("contact_phone")}</p>
              <p className="text-sm font-bold text-slate-800">0658531833</p>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-6">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">{t("send_message_title")}</h3>
          {sent ? (
            <div className="p-6 bg-green-50 rounded-2xl text-center">
              <CheckCircle2 size={40} className="mx-auto text-green-600 mb-2" />
              <p className="font-bold text-green-800">{t("message_sent")}</p>
              <p className="text-sm text-green-600">{t("message_sent_reply")}</p>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              <textarea rows={5} className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" placeholder={t("contact_message_placeholder")} value={msg} onChange={e => setMsg(e.target.value)} />
              <button type="submit" className="w-full px-6 py-3 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all">{t("send_btn")}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
