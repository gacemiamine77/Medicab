import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  UserPlus, 
  Mail, 
  Lock, 
  MapPin, 
  Hash, 
  Building, 
  Stethoscope, 
  Phone, 
  CreditCard,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  Users,
  Calendar,
  Search,
  Filter,
  Edit2,
  X,
  Save,
  Link2,
  Unlink,
  ClipboardList,
  Plus,
  FilePlus,
  FileText
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { api, User, type MedicationLibrary } from "../lib/api";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import * as XLSX from "xlsx";

export default function AdminPortal() {
  const [managementKey, setManagementKey] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'medications'>('list');
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '', email: '', phone: '', specialty: '', clinic_name: '', city: '',
    subscription_type: '', subscription_status: '', subscription_end_date: '', subscription_start_date: ''
  });
  const [saving, setSaving] = useState(false);
  const [managingLinks, setManagingLinks] = useState<{ secretaryId: number, secretaryName: string } | null>(null);
  const [linkedDoctors, setLinkedDoctors] = useState<any[]>([]);
  const [allDoctors, setAllDoctors] = useState<any[]>([]);
  const [addingDoctor, setAddingDoctor] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    role: "doctor",
    specialty: "",
    account_number: "",
    national_number: "",
    clinic_name: "",
    address: "",
    city: "",
    register_number: "",
    phone: "",
    subscription_type: "monthly",
    subscription_start_date: format(new Date(), "yyyy-MM-dd"),
    subscription_end_date: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd")
  });

  const [meds, setMeds] = useState<MedicationLibrary[]>([]);
  const [newMed, setNewMed] = useState<Partial<MedicationLibrary>>({ name: '', dosage: '', unit: '', packaging: '', dci: '', form: '', abbreviation: '', posology: '', classe: '' });
  const [medicationSearch, setMedicationSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [excelData, setExcelData] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importingExcel, setImportingExcel] = useState(false);
  const MEDICATION_FIELDS = ['name', 'dosage', 'unit', 'packaging', 'dci', 'form', 'abbreviation', 'posology', 'classe'] as const;
  const FIELD_LABELS: Record<string, string> = { name: 'Nom *', dosage: 'Dosage', unit: 'Unité', packaging: 'Conditionnement', dci: 'DCI', form: 'Forme', abbreviation: 'Abréviation', posology: 'Posologie', classe: 'Classe' };

  const loadMeds = async () => {
    try {
      const data = await api.getMedicationsLibrary();
      setMeds(data);
    } catch (err: any) {
      setError(err.message || "Erreur lors du chargement des médicaments");
    }
  };

  const handleAddMed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMed.name) return;
    try {
      await api.createMedicationLibrary(newMed);
      setNewMed({ name: '', dosage: '', unit: '', packaging: '', dci: '', form: '', abbreviation: '', posology: '', classe: '' });
      loadMeds();
      setSuccess("Médicament ajouté avec succès !");
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'ajout du médicament");
    }
  };

  const handleDeleteMed = async (id: number) => {
    if (!confirm("Confirmer la suppression de ce médicament ?")) return;
    try {
      await api.deleteMedicationLibrary(id);
      loadMeds();
      setSuccess("Médicament supprimé !");
    } catch (err: any) {
      setError(err.message || "Erreur lors de la suppression");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { alert("Fichier CSV vide ou invalide."); setImporting(false); return; }
      const delim = lines[0].includes(';') ? ';' : ',';
      const headers = lines[0].split(delim).map(h => h.trim().toLowerCase());
      const nameIdx = headers.findIndex(h => ['name', 'nom', 'medicament', 'médicament', 'libelle', 'libellé', 'produit'].includes(h));
      if (nameIdx === -1) { alert("Aucune colonne 'Nom' trouvée dans le CSV."); setImporting(false); return; }
      const dciIdx = headers.findIndex(h => ['dci', 'denomination', 'dénomination', 'substance', 'principe actif'].includes(h));
      const dosageIdx = headers.findIndex(h => ['dosage', 'dose'].includes(h));
      const unitIdx = headers.findIndex(h => ['unit', 'unite', 'unité'].includes(h));
      const formIdx = headers.findIndex(h => ['form', 'forme'].includes(h));
      const classeIdx = headers.findIndex(h => ['classe', 'class'].includes(h));
      const abbrevIdx = headers.findIndex(h => ['abbreviation', 'abreviation', 'abréviation', 'abr'].includes(h));
      const packagingIdx = headers.findIndex(h => ['packaging', 'conditionnement', 'boite', 'boîte'].includes(h));
      const posologyIdx = headers.findIndex(h => ['posology', 'posologie'].includes(h));
      const formattedMeds: Partial<MedicationLibrary>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(delim).map(c => c.trim());
        const name = cols[nameIdx];
        if (!name) continue;
        formattedMeds.push({
          name,
          dci: dciIdx >= 0 ? cols[dciIdx] : '',
          dosage: dosageIdx >= 0 ? cols[dosageIdx] : '',
          unit: unitIdx >= 0 ? cols[unitIdx] : '',
          form: formIdx >= 0 ? cols[formIdx] : '',
          classe: classeIdx >= 0 ? cols[classeIdx] : '',
          abbreviation: abbrevIdx >= 0 ? cols[abbrevIdx] : '',
          packaging: packagingIdx >= 0 ? cols[packagingIdx] : '',
          posology: posologyIdx >= 0 ? cols[posologyIdx] : '',
        });
      }
      if (!formattedMeds.length) { alert("Aucun médicament valide trouvé."); setImporting(false); return; }
      try {
        await api.importMedicationsBulk(formattedMeds);
        alert(`${formattedMeds.length} médicament(s) importé(s) avec succès.`);
        loadMeds();
      } catch (err: any) {
        alert("Erreur lors de l'importation : " + (err.message || err));
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
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
        const autoMap: Record<string, string> = {};
        const fieldSynonyms: Record<string, string[]> = {
          name: ['name', 'nom', 'medicament', 'médicament', 'libelle', 'libellé', 'produit', 'drug'],
          dosage: ['dosage', 'dose', 'dos', 'strength'],
          unit: ['unit', 'unite', 'unité', 'u'],
          packaging: ['packaging', 'conditionnement', 'pack', 'emballage', 'boite', 'boîte', 'bte'],
          dci: ['dci', 'denomination', 'dénomination', 'substance', 'active', 'principe actif'],
          form: ['form', 'forme', 'forme pharmaceutique', 'formulation', 'galenique', 'galénique'],
          abbreviation: ['abbreviation', 'abreviation', 'abréviation', 'abr', 'sigle', 'code'],
          posology: ['posology', 'posologie', 'poso'],
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

  const handleResetMeds = async () => {
    if (!confirm("Confirmer la réinitialisation complète de la bibliothèque de médicaments ? Cette action est irréversible.")) return;
    try {
      await api.resetMedicationLibrary();
      loadMeds();
      setSuccess("Bibliothèque réinitialisée avec les médicaments par défaut.");
    } catch (err: any) {
      setError(err.message || "Erreur lors de la réinitialisation");
    }
  };

  const fetchUsers = async () => {
    if (!managementKey) return;
    setLoading(true);
    try {
      const data = await api.adminGetUsers(managementKey);
      setUsers(data);
    } catch (err: any) {
      setError(err.message || "Erreur lors du chargement des praticiens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized && activeTab === 'list') {
      fetchUsers();
    }
    if (isAuthorized && activeTab === 'medications') {
      loadMeds();
    }
  }, [isAuthorized, activeTab]);

  const handleAuthorize = (e: React.FormEvent) => {
    e.preventDefault();
    if (managementKey) {
      setIsAuthorized(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await api.adminCreateUser(formData, managementKey);
      setSuccess(`Le compte pour Dr. ${formData.full_name} a été créé. Un email a été envoyé à ${formData.email}.`);
      setFormData({
        email: "",
        password: "",
        full_name: "",
        role: "doctor",
        specialty: "",
        account_number: "",
        national_number: "",
        clinic_name: "",
        address: "",
        city: "",
        register_number: "",
        phone: "",
        subscription_type: "monthly",
        subscription_start_date: format(new Date(), "yyyy-MM-dd"),
        subscription_end_date: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd")
      });
      if (activeTab === 'list') fetchUsers();
      else setActiveTab('list');
    } catch (err: any) {
      setError(err.message || "Erreur lors de la création de l'utilisateur");
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => 
    user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.clinic_name && user.clinic_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          <div className="bg-slate-800 p-8 text-white text-center">
            <ShieldCheck size={48} className="mx-auto mb-4 text-blue-400" />
            <h1 className="text-2xl font-black tracking-tight">Accès Administration</h1>
            <p className="text-slate-400 text-sm mt-1">Saisissez la clé de gestion pour continuer</p>
          </div>
          <form onSubmit={handleAuthorize} className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Clé de Gestion (Secret)</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="password" 
                  value={managementKey}
                  onChange={(e) => setManagementKey(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                  placeholder="••••••••••••"
                  required
                />
              </div>
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all"
            >
              Déverrouiller le Portail
            </button>
            <p className="text-center text-xs text-slate-400 font-medium">
              Cet espace est strictement réservé au propriétaire de la solution.
            </p>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-lg">
              <ShieldCheck size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Portail de Gestion - Cabinet Médical</h1>
              <p className="text-slate-500 font-medium">Création et configuration des comptes praticiens</p>
            </div>
          </div>
          <button 
            onClick={() => setIsAuthorized(false)}
            className="px-4 py-2 text-slate-400 hover:text-slate-800 font-black text-xs uppercase tracking-widest flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Déconnexion Admin
          </button>
        </header>

        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-3xl flex items-center gap-4"
          >
            <CheckCircle2 size={24} className="shrink-0" />
            <p className="font-bold">{success}</p>
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-red-50 border border-red-100 text-red-700 rounded-3xl flex items-center gap-4"
          >
            <AlertCircle size={24} className="shrink-0" />
            <p className="font-bold">{error}</p>
          </motion.div>
        )}

        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-4 rounded-3xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${activeTab === 'list' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Users size={20} />
            Liste des Praticiens
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-4 rounded-3xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${activeTab === 'create' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <UserPlus size={20} />
            Ajouter un Compte
          </button>
          <button 
            onClick={() => setActiveTab('medications')}
            className={`flex-1 py-4 rounded-3xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-center gap-3 ${activeTab === 'medications' ? 'bg-white text-blue-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <ClipboardList size={20} />
            Médicaments
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'medications' ? (
            <motion.div
              key="medications"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <ClipboardList size={20} className="text-blue-600" />
                  Gestion des Médicaments
                </h2>
              </div>

              <div className="p-8 space-y-8">
                {/* Import / Reset Buttons */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl cursor-pointer hover:bg-emerald-100 transition shadow-sm font-bold text-xs">
                    <FilePlus size={18} /> {importing ? "Importation..." : "Import CSV"}
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={importing} />
                  </label>
                  <label className="flex items-center gap-2 px-5 py-2.5 bg-amber-50 text-amber-700 rounded-xl cursor-pointer hover:bg-amber-100 transition shadow-sm font-bold text-xs">
                    <FileText size={18} /> {importingExcel ? "Importation..." : "Import Excel"}
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelSelect(f); }} disabled={importingExcel} />
                  </label>
                  <button onClick={handleResetMeds} className="flex items-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition shadow-sm font-bold text-[10px] uppercase tracking-wider">
                    <X size={15} /> Réinitialiser
                  </button>
                </div>

                {/* Add Medication Form */}
                <form onSubmit={handleAddMed} className="grid grid-cols-1 md:grid-cols-5 gap-4 p-8 bg-slate-50 rounded-2xl border border-slate-200/50 shadow-inner">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">Nom *</label>
                    <input required type="text" placeholder="DOLIPRANE" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700" value={newMed.name} onChange={e => setNewMed({...newMed, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">Dosage</label>
                    <input type="text" placeholder="500" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-semibold text-slate-600" value={newMed.dosage} onChange={e => setNewMed({...newMed, dosage: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">Unité</label>
                    <input type="text" placeholder="mg" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.unit || ''} onChange={e => setNewMed({...newMed, unit: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">Conditionnement</label>
                    <input type="text" placeholder="Boîte de 8" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.packaging || ''} onChange={e => setNewMed({...newMed, packaging: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">DCI</label>
                    <input type="text" placeholder="Paracétamol" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.dci || ''} onChange={e => setNewMed({...newMed, dci: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">Classe</label>
                    <input type="text" placeholder="Antalgique" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.classe || ''} onChange={e => setNewMed({...newMed, classe: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">Forme</label>
                    <input type="text" placeholder="Comprimé" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.form} onChange={e => setNewMed({...newMed, form: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest pl-1">Abréviation</label>
                    <input type="text" placeholder="DOLI" className="w-full px-4 py-3 bg-white rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-slate-600" value={newMed.abbreviation || ''} onChange={e => setNewMed({...newMed, abbreviation: e.target.value})} />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" className="w-full h-[52px] bg-blue-600 text-white font-black rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100 uppercase tracking-widest text-xs">
                      <Plus size={18} /> Ajouter
                    </button>
                  </div>
                </form>

                {/* Search */}
                <div className="flex items-center gap-3 mb-3">
                  <Search size={18} className="text-slate-400 shrink-0" />
                  <input type="text" value={medicationSearch} onChange={e => setMedicationSearch(e.target.value)} placeholder="Rechercher un médicament..." className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-bold text-slate-700 text-xs" />
                  {medicationSearch && <button type="button" onClick={() => setMedicationSearch('')} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>}
                </div>

                {/* Medications Table */}
                <div className="overflow-hidden bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      <tr>
                        <th className="px-4 py-4">Nom</th>
                        <th className="px-4 py-4">Dosage</th>
                        <th className="px-4 py-4">Unité</th>
                        <th className="px-4 py-4">Condit.</th>
                        <th className="px-4 py-4">DCI</th>
                        <th className="px-4 py-4">Classe</th>
                        <th className="px-4 py-4">Forme</th>
                        <th className="px-4 py-4">Abrév.</th>
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
                              <p>Aucun médicament dans la bibliothèque.</p>
                              <p className="text-[10px] font-bold uppercase not-italic">Importez un fichier CSV/Excel ou ajoutez manuellement.</p>
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

              {/* Excel Import Modal */}
              <AnimatePresence>
                {showExcelImport && excelData && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    >
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-black uppercase tracking-tight">Mapping des colonnes Excel</h3>
                        <button onClick={() => { setShowExcelImport(false); setExcelData(null); }} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"><X size={20} /></button>
                      </div>
                      <p className="text-sm text-slate-500 font-medium mb-6">Associez chaque colonne du fichier Excel au champ correspondant.</p>
                      {excelData.headers.map(header => (
                        <div key={header} className="flex items-center gap-4 mb-4 p-4 bg-slate-50 rounded-2xl">
                          <span className="font-bold text-sm text-slate-700 w-40 truncate">{header}</span>
                          <select
                            className="flex-1 px-4 py-3 bg-white rounded-xl border border-slate-200 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                            value={columnMapping[header] || ''}
                            onChange={e => setColumnMapping(prev => ({ ...prev, [header]: e.target.value }))}
                          >
                            <option value="">— Ignorer —</option>
                            {MEDICATION_FIELDS.map(f => (
                              <option key={f} value={f}>{FIELD_LABELS[f]}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                      <div className="flex justify-end gap-3 mt-8">
                        <button onClick={() => { setShowExcelImport(false); setExcelData(null); }} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs hover:bg-slate-200">Annuler</button>
                        <button onClick={handleExcelImport} disabled={importingExcel} className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 flex items-center gap-2">
                          {importingExcel ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Importation...</> : <><FileText size={16} /> Importer</>}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : activeTab === 'create' ? (
            <motion.div 
              key="create"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden"
            >
              <div className="p-8 border-b border-slate-50">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                  <UserPlus size={20} className="text-blue-600" />
                  Nouveau Praticien / Cabinet
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Profile Details */}
                  <div className="col-span-full mb-2">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-8 h-[2px] bg-blue-600"></span> Identifiants de Connexion
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nom Complet du Praticien</label>
                    <div className="relative">
                      <UserPlus className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        required
                        placeholder="Dr. Mohamed Benali"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.full_name}
                        onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Email (Identifiant)</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="email" 
                        required
                        placeholder="doctor@example.com"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Mot de Passe Provisoire</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        required
                        placeholder="Saisissez un code"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Rôle Principal</label>
                    <select 
                      className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold bg-white"
                      value={formData.role}
                      onChange={(e) => setFormData({...formData, role: e.target.value})}
                    >
                      <option value="doctor">Médecin / Chirurgien Dentiste</option>
                      <option value="pharmacist">Pharmacien</option>
                      <option value="secretary">Secrétaire Médicale</option>
                      <option value="laboratory">Laboratoire d'analyses</option>
                      <option value="imaging_center">Centre d'Imagerie Médicale</option>
                    </select>
                  </div>

                  {/* Professional Details */}
                  <div className="col-span-full mb-2 mt-4">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-8 h-[2px] bg-blue-600"></span> Informations Professionnelles
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Nom du Cabinet / Clinique</label>
                    <div className="relative">
                      <Building className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Cabinet Dentaire Alpha"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.clinic_name}
                        onChange={(e) => setFormData({...formData, clinic_name: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Spécialité & Mentions</label>
                    <div className="relative">
                      <Stethoscope className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Chirurgien Dentiste"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.specialty}
                        onChange={(e) => setFormData({...formData, specialty: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Numéro de Registre / Autorisation</label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="N° d'autorisation DSP"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.register_number}
                        onChange={(e) => setFormData({...formData, register_number: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Numéro National (ID Praticien)</label>
                    <div className="relative">
                      <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="ID National (DSP)"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.national_number}
                        onChange={(e) => setFormData({...formData, national_number: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Téléphone Professionnel</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="+213 XX XX XX XX"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Ville</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        placeholder="Ex: Alger, Oran..."
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.city}
                        onChange={(e) => setFormData({...formData, city: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="col-span-full space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Adresse Complète</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-12 text-slate-400" size={18} />
                      <textarea 
                        rows={2}
                        placeholder="Adresse exacte du cabinet..."
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.address}
                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                      />
                    </div>
                  </div>

                  {/* Business Details */}
                  <div className="col-span-full mb-2 mt-4">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-4 flex items-center gap-2">
                      <span className="w-8 h-[2px] bg-blue-600"></span> Détails Abonnement & Gestion
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Numéro de Compte (Interne)</label>
                    <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="text" 
                        required
                        placeholder="ACC-2024-XXXX"
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.account_number}
                        onChange={(e) => setFormData({...formData, account_number: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Type d'Abonnement</label>
                      <select 
                        className="w-full p-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold bg-white"
                        value={formData.subscription_type}
                        onChange={(e) => setFormData({...formData, subscription_type: e.target.value})}
                      >
                        <option value="trial">Trial (10 patients max)</option>
                        <option value="monthly">Mensuel (Abonnement)</option>
                        <option value="annually">Annuel (Abonnement)</option>
                        <option value="full">Paiement Totalité (Licence)</option>
                      </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Début d'Abonnement</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="date" 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.subscription_start_date}
                        onChange={(e) => setFormData({...formData, subscription_start_date: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1">Fin d'Abonnement</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="date" 
                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                        value={formData.subscription_end_date}
                        onChange={(e) => setFormData({...formData, subscription_end_date: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-8 flex flex-col sm:flex-row gap-4">
                  <button 
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-70"
                  >
                    {loading ? (
                      <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    ) : (
                      <UserPlus size={20} />
                    )}
                    Valider & Générer les Identifiants
                  </button>
                  <button 
                    type="reset"
                    onClick={() => setFormData({
                      email: "", password: "", full_name: "", role: "doctor", specialty: "",
                      account_number: "", national_number: "", clinic_name: "", address: "",
                      city: "", register_number: "", phone: "", subscription_type: "monthly",
                      subscription_start_date: format(new Date(), "yyyy-MM-dd"),
                      subscription_end_date: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd")
                    })}
                    className="px-8 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all"
                  >
                    Réinitialiser
                  </button>
                </div>
                
                <p className="text-[10px] text-slate-400 font-bold uppercase text-center mt-8 tracking-widest">
                  L'envoi de l'email est AUTOMATIQUE après validation par l'administrateur.
                </p>
              </form>
            </motion.div>
          ) : (
            <motion.div 
              key="list"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Rechercher un praticien, email, clinique..."
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-blue-100 transition-all font-bold"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
                  <Filter size={16} className="text-slate-400" />
                  <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{filteredUsers.length} Comptes</span>
                </div>
              </div>

              {loading && users.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
                  <div className="w-12 h-12 border-4 border-slate-100 border-t-blue-500 rounded-full animate-spin"></div>
                  <p className="font-black uppercase tracking-widest text-xs">Chargement des données...</p>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-20 bg-white rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center gap-4 text-slate-400">
                  <Users size={48} className="opacity-20" />
                  <p className="font-bold">Aucun praticien trouvé</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredUsers.map((user) => (
                    <motion.div 
                      key={user.id}
                      layout
                      className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all group"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                            <Stethoscope size={28} />
                          </div>
                          <div>
                            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{user.full_name}</h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
                              <span className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                                <Mail size={14} className="text-slate-400" />
                                {user.email}
                              </span>
                              {user.phone && (
                                <span className="flex items-center gap-1.5 text-slate-500 text-xs font-medium">
                                  <Phone size={14} className="text-slate-400" />
                                  {user.phone}
                                </span>
                              )}
                              {user.role && (
                                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md">
                                  {user.role}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-blue-600 mt-2 flex items-center gap-2">
                              <Building size={14} />
                              {user.clinic_name || "Clinique non spécifiée"} {user.city && `• ${user.city}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 lg:text-right">
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 min-w-[180px]">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Abonnement ({user.subscription_type})</p>
                            <div className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-medium">Statut:</span>
                                <span className={`font-black uppercase tracking-tighter ${user.subscription_status === 'active' ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {user.subscription_status === 'active' ? 'Activé' : 'Suspendu'}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-medium">Début:</span>
                                <span className="text-slate-800 font-bold">
                                  {user.subscription_start_date ? format(new Date(user.subscription_start_date), "dd/MM/yyyy") : "-"}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-medium">Fin:</span>
                                <span className="text-slate-800 font-bold">
                                  {user.subscription_end_date ? format(new Date(user.subscription_end_date), "dd/MM/yyyy") : "-"}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {user.role === 'secretary' && (
                            <button
                              onClick={async () => {
                                setManagingLinks({ secretaryId: user.id, secretaryName: user.full_name });
                                try {
                                  const [links, docs] = await Promise.all([
                                    api.getAdminSecretaryLinks(user.id),
                                    api.getDoctors()
                                  ]);
                                  setLinkedDoctors(links || []);
                                  setAllDoctors(docs || []);
                                } catch {}
                              }}
                              className="p-3 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-2xl transition-all"
                              title="Gérer les médecins liés"
                            >
                              <Link2 size={20} />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setEditingUser(user);
                              setEditForm({
                                full_name: user.full_name || '',
                                email: user.email || '',
                                phone: user.phone || '',
                                specialty: user.specialty || '',
                                clinic_name: user.clinic_name || '',
                                city: user.city || '',
                                subscription_type: user.subscription_type || 'monthly',
                                subscription_status: user.subscription_status || 'active',
                                subscription_end_date: user.subscription_end_date ? format(new Date(user.subscription_end_date), "yyyy-MM-dd") : '',
                                subscription_start_date: user.subscription_start_date ? format(new Date(user.subscription_start_date), "yyyy-MM-dd") : ''
                              });
                            }}
                            className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-all"
                            title="Modifier le compte"
                          >
                            <Edit2 size={20} />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Secretary Links Modal */}
        <AnimatePresence>
          {managingLinks && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setManagingLinks(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <Link2 size={20} className="text-amber-600" />
                    Médecins liés — {managingLinks.secretaryName}
                  </h3>
                  <button onClick={() => setManagingLinks(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  {linkedDoctors.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 italic text-sm">Aucun médecin lié</div>
                  ) : (
                    <div className="space-y-2">
                      {linkedDoctors.map((link: any) => (
                        <div key={link.id || link.doctor_id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <div>
                            <p className="text-sm font-black text-slate-800 uppercase">{link.full_name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{link.specialty || 'Médecin'}</p>
                          </div>
                          <button
                            onClick={async () => {
                              if (!confirm(`Retirer ${link.full_name} des médecins liés ?`)) return;
                              try {
                                await api.removeSecretaryLink(managingLinks.secretaryId, link.doctor_id);
                                setLinkedDoctors(prev => prev.filter((l: any) => l.doctor_id !== link.doctor_id));
                              } catch { alert("Erreur"); }
                            }}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all"
                            title="Retirer"
                          >
                            <Unlink size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-4 border-t border-slate-100">
                    <div className="flex gap-2">
                      <select
                        className="flex-1 px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        value=""
                        onChange={async (e) => {
                          const docId = parseInt(e.target.value);
                          if (!docId) return;
                          try {
                            await api.addSecretaryLink(managingLinks.secretaryId, docId);
                            const doc = allDoctors.find((d: any) => d.id === docId);
                            if (doc) setLinkedDoctors(prev => [...prev, { doctor_id: docId, full_name: doc.full_name, specialty: doc.specialty }]);
                          } catch { alert("Erreur"); }
                          e.target.value = '';
                        }}
                      >
                        <option value="">Ajouter un médecin...</option>
                        {allDoctors
                          .filter((d: any) => !linkedDoctors.some((l: any) => l.doctor_id === d.id))
                          .map((d: any) => (
                            <option key={d.id} value={d.id}>{d.full_name} — {d.specialty || 'Médecin'}</option>
                          ))
                        }
                      </select>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit User Modal */}
        <AnimatePresence>
          {editingUser && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50" onClick={() => setEditingUser(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-3xl p-8 shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                    <Edit2 size={20} className="text-blue-600" />
                    Modifier le compte
                  </h3>
                  <button onClick={() => setEditingUser(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-all">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nom complet</label>
                      <input type="text" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})} />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email</label>
                      <input type="email" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Téléphone</label>
                      <input type="text" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Spécialité</label>
                      <input type="text" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.specialty} onChange={e => setEditForm({...editForm, specialty: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clinique</label>
                      <input type="text" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.clinic_name} onChange={e => setEditForm({...editForm, clinic_name: e.target.value})} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ville</label>
                      <input type="text" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.city} onChange={e => setEditForm({...editForm, city: e.target.value})} />
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <h4 className="text-xs font-black text-blue-600 uppercase tracking-widest mb-4">Abonnement</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</label>
                        <select className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.subscription_type} onChange={e => setEditForm({...editForm, subscription_type: e.target.value})}>
                          <option value="trial">Trial (10 max)</option>
                          <option value="monthly">Mensuel</option>
                          <option value="annually">Annuel</option>
                          <option value="full">Licence complète</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Statut</label>
                        <select className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.subscription_status} onChange={e => setEditForm({...editForm, subscription_status: e.target.value})}>
                          <option value="active">Actif</option>
                          <option value="suspended">Suspendu</option>
                          <option value="expired">Expiré</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Début</label>
                        <input type="date" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.subscription_start_date} onChange={e => setEditForm({...editForm, subscription_start_date: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fin</label>
                        <input type="date" className="w-full px-4 py-2.5 bg-slate-50 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 mt-1" value={editForm.subscription_end_date} onChange={e => setEditForm({...editForm, subscription_end_date: e.target.value})} />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                    <button onClick={() => setEditingUser(null)} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-600 uppercase tracking-wider text-xs hover:bg-slate-200 transition-all">Annuler</button>
                    <button
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          await api.adminUpdateUser(editingUser.id, {
                            full_name: editForm.full_name,
                            email: editForm.email,
                            phone: editForm.phone,
                            specialty: editForm.specialty,
                            clinic_name: editForm.clinic_name,
                            city: editForm.city,
                            subscription_type: editForm.subscription_type,
                            subscription_status: editForm.subscription_status,
                            subscription_start_date: editForm.subscription_start_date,
                            subscription_end_date: editForm.subscription_end_date,
                          }, managementKey);
                          setEditingUser(null);
                          setSuccess("Compte mis à jour avec succès !");
                          fetchUsers();
                        } catch (err: any) {
                          setError(err.message || "Erreur lors de la mise à jour");
                        } finally {
                          setSaving(false);
                        }
                      }}
                      className="px-8 py-3 rounded-xl font-bold bg-blue-600 text-white uppercase tracking-wider text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2"
                    >
                      {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Enregistrement...</> : <><Save size={16} /> Enregistrer</>}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
