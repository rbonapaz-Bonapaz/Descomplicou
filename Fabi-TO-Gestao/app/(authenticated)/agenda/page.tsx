
"use client"

import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { useFirestore, useCollection } from '@/firebase';
import { collection, query, where, doc, deleteDoc, onSnapshot, orderBy, Timestamp, addDoc, updateDoc } from 'firebase/firestore';
import { Appointment, User, Patient, HealthPlan, ClinicSettings, AppointmentStatus, Holiday } from '@/app/lib/types';
import { Card, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MoreVertical, 
  Plus, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  Play, 
  Square, 
  ClipboardList, 
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Lock,
  Trash2,
  FileText,
  Globe,
  Settings2,
  MessageSquare,
  Check,
  MapPin,
  UserX,
  CalendarDays,
  Save,
  Repeat,
  PlusCircle,
  User as UserIcon,
  DollarSign,
  History,
  CalendarOff,
  Ban,
  RotateCcw,
  X,
  Stethoscope,
  AlertTriangle,
  Info
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, subDays, parseISO, addMinutes, differenceInYears, isAfter, isSameWeek, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { logAction } from '@/services/auditService';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

const VerticalText = ({ text, className }: { text: string; className?: string }) => (
  <div className={cn("flex flex-col items-center leading-[0.8] tracking-tighter", className)}>
    {text.split('').map((char, i) => (
      <span key={i} className="block uppercase text-[9px] font-black">{char === ' ' ? '\u00A0' : char}</span>
    ))}
  </div>
);

const timeToMinutes = (timeStr: string) => {
  if (!timeStr) return 0;
  try {
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  } catch (e) {
    return 0;
  }
};

const normalizeDate = (d: any): Date | null => {
  if (!d) return null;
  try {
    if (d instanceof Date) return d;
    if (typeof d.toDate === 'function') return d.toDate();
    if (d.seconds) return new Date(d.seconds * 1000);
    const parsed = parseISO(d);
    return isValid(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
};

export default function AgendaPage() {
  const { user, isGestor, isGuest } = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();

  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly' | 'google'>('daily');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<string>(user?.uid || 'all');
  const [currentDate, setSelectedDate] = useState(new Date());
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [editingAppointmentId, setEditingAppointmentId] = useState<string | null>(null);
  const [isDialogTriggerFromGrid, setIsDialogTriggerFromGrid] = useState(false);

  const [cancelData, setCancelData] = useState({
    origem: 'paciente' as 'paciente' | 'profissional',
    prazo: 'no_prazo' as 'no_prazo' | 'fora_do_prazo',
    cobrar: false,
    justificativa: ''
  });
  const [deleteJustification, setDeleteJustification] = useState('');

  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  const [formData, setFormData] = useState({
    paciente_id: '',
    paciente_nome: '',
    convenio_id: 'particular',
    isBlockage: false,
    motivo_bloqueio: '',
    startTime: '',
    endTime: '',
    profissional_id: '',
    data: '',
    recorrencia: 'nenhuma'
  });

  const professionalsQuery = useMemo(() => firestore ? query(collection(firestore, 'usuarios'), where('possui_agenda', '==', true)) : null, [firestore]);
  const patientsQuery = useMemo(() => firestore ? query(collection(firestore, 'pacientes')) : null, [firestore]);
  const plansQuery = useMemo(() => firestore ? query(collection(firestore, 'convenios')) : null, [firestore]);
  
  const { data: professionals } = useCollection<User>(professionalsQuery);
  const { data: patients } = useCollection<Patient>(patientsQuery);
  const { data: plans } = useCollection<HealthPlan>(plansQuery);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  
  useEffect(() => {
    if (!firestore) {
      if (isGuest) {
        const savedHolidays = localStorage.getItem('demo_holidays');
        if (savedHolidays) setHolidays(JSON.parse(savedHolidays));
        const savedApts = localStorage.getItem('demo_appointments');
        if (savedApts) setAppointments(JSON.parse(savedApts));
        
        const handleStorage = () => {
          const updatedApts = localStorage.getItem('demo_appointments');
          if (updatedApts) setAppointments(JSON.parse(updatedApts));
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
      }
      return;
    }

    const qApts = query(collection(firestore, 'agendamentos'), orderBy('data_hora', 'asc'));
    const unsubApts = onSnapshot(qApts, (snap) => {
      setAppointments(snap.docs.map(d => {
        const data = d.data();
        let dt = data.data_hora;
        if (dt instanceof Timestamp) dt = dt.toDate().toISOString();
        return { id: d.id, ...data, data_hora: dt } as Appointment;
      }));
    });

    const unsubSet = onSnapshot(doc(firestore, 'configuracoes', 'clinica'), (snap) => {
      if (snap.exists()) setSettings(snap.data() as ClinicSettings);
    });

    const unsubHol = onSnapshot(collection(firestore, 'feriados'), (snap) => {
      setHolidays(snap.docs.map(d => ({ id: d.id, ...d.data() } as Holiday)));
    });

    return () => { unsubApts(); unsubSet(); unsubHol(); };
  }, [firestore, isGuest]);

  useEffect(() => {
    if (!formData.isBlockage && formData.startTime && formData.data) {
      const [h, m] = formData.startTime.split(':');
      const dateStr = `${formData.data}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
      const date = parseISO(dateStr);
      if (isValid(date)) {
        const duration = settings?.duracao_sessao || 50;
        const end = format(addMinutes(date, duration), 'HH:mm');
        setFormData(prev => ({ ...prev, endTime: end }));
      }
    }
  }, [formData.startTime, formData.data, settings?.duracao_sessao, formData.isBlockage]);

  const checkIsBlockingHoliday = (date: Date) => {
    const dStr = format(date, 'MM-dd');
    const yStr = format(date, 'yyyy');

    return holidays.find(h => {
      if (!h.bloqueia_agenda || !h.data) return false;
      const parts = h.data.split('-');
      if (parts.length < 2) return false;
      const hM = Number(parts[1]).toString().padStart(2, '0');
      const hD = Number(parts[2]).toString().padStart(2, '0');
      const hY = Number(parts[0]).toString();
      const hMD = `${hM}-${hD}`;
      return h.recorrente ? hMD === dStr : (hMD === dStr && hY === yStr);
    });
  };

  const getTimeSlotsForDay = (date: Date) => {
    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const dayId = dayNames[date.getDay()];
    const config = settings?.workingHours?.[dayId];

    if (!config?.active) return [];

    const slots = [];
    const [startH, startM] = (config.start || "08:00").split(':').map(Number);
    const [endH, endM] = (config.end || "18:00").split(':').map(Number);
    
    let current = new Date(date);
    current.setHours(startH, startM, 0, 0);
    const end = new Date(date);
    end.setHours(endH, endM, 0, 0);

    const duration = settings?.duracao_sessao || 50;
    const buffer = settings?.intervalo_sessao || 10;
    const totalCycle = duration + buffer;

    while (current < end) {
      const timeStr = format(current, 'HH:mm');
      const activeBreak = config.pausas?.find(p => timeStr >= p.start && timeStr < p.end);
      
      if (!activeBreak) {
        slots.push({ type: 'slot', time: timeStr });
      } else {
        if (!slots.some(s => s.type === 'break' && s.id === activeBreak.id)) {
          slots.push({ type: 'break', ...activeBreak, time: activeBreak.start });
        }
      }
      current = new Date(current.getTime() + totalCycle * 60000);
    }
    return slots;
  };

  const availableSlots = useMemo(() => {
    if (!formData.data || !formData.profissional_id) return [];
    
    const targetDateStr = formData.data; 
    const allPotentialSlots = getTimeSlotsForDay(parseISO(targetDateStr));
    
    const dayApts = appointments.filter(a => {
      if (!a.data_hora || a.status === 'cancelado') return false;
      const d = normalizeDate(a.data_hora);
      if (!d) return false;
      return format(d, 'yyyy-MM-dd') === targetDateStr && 
             a.profissional_id === formData.profissional_id && 
             a.id !== editingAppointmentId;
    });
    
    return allPotentialSlots
      .filter(s => s.type === 'slot')
      .filter(s => {
        const slotMins = timeToMinutes(s.time);
        const isOccupied = dayApts.some(a => {
          const startMins = timeToMinutes(a.time || format(normalizeDate(a.data_hora)!, 'HH:mm'));
          const endMins = timeToMinutes(a.endTime || format(addMinutes(normalizeDate(a.data_hora)!, settings?.duracao_sessao || 50), 'HH:mm'));
          
          if (a.status === 'bloqueado') {
            return (slotMins >= startMins && slotMins < endMins);
          }
          return slotMins === startMins;
        });

        return !isOccupied || s.time === formData.startTime;
      })
      .map(s => s.time);
  }, [formData.data, formData.profissional_id, appointments, editingAppointmentId, settings]);

  const handleSaveAppointment = () => {
    if (!formData.data || !formData.startTime || !formData.profissional_id) {
      toast({ variant: "destructive", title: "Campos incompletos", description: "Verifique data, horário e profissional." });
      return;
    }

    if (!formData.isBlockage && !formData.paciente_id) {
      toast({ variant: "destructive", title: "Selecione um paciente" });
      return;
    }

    let date;
    try {
      const [h, m] = formData.startTime.split(':').map(Number);
      const isoDateString = `${formData.data}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
      date = parseISO(isoDateString);
      if (!isValid(date)) throw new Error("Data Inválida");
    } catch (e) {
      toast({ variant: "destructive", title: "Erro no formato de data/hora" });
      return;
    }

    const duration = settings?.duracao_sessao || 50;
    const calculatedEndTime = format(addMinutes(date, duration), 'HH:mm');

    const payload: any = {
      paciente_id: formData.isBlockage ? null : formData.paciente_id,
      paciente_nome: formData.isBlockage ? (formData.motivo_bloqueio || 'BLOQUEIO') : (patients?.find(p => p.id === formData.paciente_id)?.nome || formData.paciente_nome),
      data_hora: date.toISOString(),
      time: formData.startTime,
      endTime: formData.isBlockage ? (formData.endTime || "23:59") : calculatedEndTime,
      profissional_id: formData.profissional_id,
      convenio_id: formData.isBlockage ? 'particular' : (formData.convenio_id || 'particular'),
      status: formData.isBlockage ? 'bloqueado' : 'agendado',
      motivo_bloqueio: formData.isBlockage ? formData.motivo_bloqueio : null,
      recorrencia_tipo: formData.recorrencia,
      valor_final: formData.isBlockage ? 0 : (plans?.find(p => p.id === formData.convenio_id)?.valor_sessao || 0)
    };

    const closeModalAndClear = () => {
      setIsDialogOpen(false);
      setEditingAppointmentId(null);
      toast({ title: formData.isBlockage ? "Bloqueio registrado" : "Agendamento realizado" });
    };

    if (formData.isBlockage) {
      const startMins = timeToMinutes(formData.startTime);
      const endMins = timeToMinutes(formData.endTime || "23:59");
      
      const conflictingApts = appointments.filter(a => {
        if (!a.data_hora || a.status === 'cancelado' || a.status === 'bloqueado' || a.profissional_id !== formData.profissional_id) return false;
        try {
          const d = normalizeDate(a.data_hora);
          if (!d || format(d, 'yyyy-MM-dd') !== formData.data) return false;
          const aptStartMins = timeToMinutes(a.time || format(d, 'HH:mm'));
          const aptEndMins = timeToMinutes(a.endTime || format(addMinutes(d, settings?.duracao_sessao || 50), 'HH:mm'));
          return (aptStartMins < endMins && aptEndMins > startMins);
        } catch (err) { return false; }
      });

      if (conflictingApts.length > 0) {
        const confirm = window.confirm(`Atenção: Existem ${conflictingApts.length} pacientes agendados neste período. Deseja prosseguir e sinalizar inconsistência para remanejamento?`);
        if (!confirm) return;

        conflictingApts.forEach(apt => {
          if (isGuest) {
            const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
            const updated = saved.map((x: any) => x.id === apt.id ? { ...x, conflito_com_bloqueio: true } : x);
            localStorage.setItem('demo_appointments', JSON.stringify(updated));
          } else if (firestore) {
            updateDoc(doc(firestore, 'agendamentos', apt.id), { conflito_com_bloqueio: true });
          }
        });
      }
    }

    if (isGuest) {
      const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
      if (editingAppointmentId) {
        const updated = saved.map((a: any) => a.id === editingAppointmentId ? { ...a, ...payload } : a);
        localStorage.setItem('demo_appointments', JSON.stringify(updated));
      } else {
        const newApt = { ...payload, id: Math.random().toString(36).substr(2, 9) };
        localStorage.setItem('demo_appointments', JSON.stringify([...saved, newApt]));
      }
      window.dispatchEvent(new Event('storage'));
      closeModalAndClear();
    } else if (firestore) {
      const appointmentsRef = collection(firestore, 'agendamentos');
      const mutation = editingAppointmentId 
        ? updateDoc(doc(firestore, 'agendamentos', editingAppointmentId), payload) 
        : addDoc(appointmentsRef, payload);

      mutation.catch(async (error) => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: editingAppointmentId ? `agendamentos/${editingAppointmentId}` : 'agendamentos',
          operation: editingAppointmentId ? 'update' : 'create',
          requestResourceData: payload,
        }));
      });
      
      closeModalAndClear();
    }
  };

  const handleAddNewMotivo = async () => {
    const novo = prompt("Digite o novo motivo de bloqueio:");
    if (novo && settings) {
      const novosMotivos = [...(settings.motivos_bloqueio || []), novo];
      if (isGuest) {
        const updated = { ...settings, motivos_bloqueio: novosMotivos };
        setSettings(updated);
        localStorage.setItem('demo_settings', JSON.stringify(updated));
      } else if (firestore) {
        updateDoc(doc(firestore, 'configuracoes', 'clinica'), { motivos_bloqueio: novosMotivos });
      }
      setFormData(prev => ({ ...prev, motivo_bloqueio: novo }));
      toast({ title: "Motivo adicionado" });
    }
  };

  const handleAction = async (apt: Appointment, newStatus: AppointmentStatus) => {
    if (newStatus === 'cancelado') {
      setSelectedAppointment(apt);
      setCancelData({ 
        origem: 'paciente',
        prazo: 'no_prazo',
        cobrar: false,
        justificativa: '' 
      });
      setIsCancelDialogOpen(true);
      return;
    }

    const update: any = { 
      status: newStatus,
      status_anterior: apt.status 
    };
    
    if (newStatus === 'atendimento') {
      update.inicio_atendimento = new Date().toISOString();
      update.chegada_horario = apt.chegada_horario || new Date().toISOString();
    }
    if (newStatus === 'realizado') update.fim_atendimento = new Date().toISOString();
    if (newStatus === 'espera') update.chegada_horario = new Date().toISOString();
    
    if (isGuest) {
      const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
      const updated = saved.map((a: any) => a.id === apt.id ? { ...a, ...update } : a);
      localStorage.setItem('demo_appointments', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
      if (newStatus === 'atendimento') router.push(`/pacientes/prontuario/?id=${apt.paciente_id}`);
      return;
    } else if (firestore) {
      const ref = doc(firestore, 'agendamentos', apt.id);
      updateDoc(ref, update).catch(async (error) => {
         errorEmitter.emit('permission-error', new FirestorePermissionError({
           path: ref.path,
           operation: 'update',
           requestResourceData: update,
         }));
      });
      if (newStatus === 'atendimento') {
        toast({ title: "Iniciando Atendimento", description: `Abrindo prontuário de ${apt.paciente_nome}...` });
        router.push(`/pacientes/prontuario/?id=${apt.paciente_id}`);
      } else {
        toast({ title: "Status Atualizado" });
      }
    }
  };

  const handleWhatsAppAction = (apt: Appointment) => {
    const patientData = patients?.find(p => p.id === apt.paciente_id);
    const tel = patientData?.telefone?.replace(/\D/g, '');
    const update = { status: 'aguardando_retorno' as AppointmentStatus, status_anterior: apt.status };

    if (isGuest) {
      const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
      const updated = saved.map((a: any) => a.id === apt.id ? { ...a, ...update } : a);
      localStorage.setItem('demo_appointments', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } else if (firestore) {
      updateDoc(doc(firestore, 'agendamentos', apt.id), update);
    }
    if (tel) window.open(`https://wa.me/55${tel}`, '_blank');
    toast({ title: "Lembrete enviado", description: "Status alterado para aguardando retorno." });
  };

  const handleUndoStep = (apt: Appointment) => {
    if (!apt.status_anterior) return;
    const update: any = { status: apt.status_anterior, status_anterior: null };
    if (apt.status === 'atendimento') update.inicio_atendimento = null;
    if (apt.status === 'realizado') update.fim_atendimento = null;
    if (apt.status === 'espera') update.chegada_horario = null;

    if (isGuest) {
      const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
      const updated = saved.map((a: any) => a.id === apt.id ? { ...a, ...update } : a);
      localStorage.setItem('demo_appointments', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } else if (firestore) {
      updateDoc(doc(firestore, 'agendamentos', apt.id), update);
    }
    toast({ title: "Etapa Estornada" });
  };

  const handleConfirmCancel = () => {
    if (!selectedAppointment) return;
    const update: any = {
      status: 'cancelado',
      status_anterior: selectedAppointment.status,
      cancelamento_origem: cancelData.origem,
      cancelamento_prazo: cancelData.prazo,
      cancelamento_cobrado: cancelData.cobrar,
      cancelamento_justificativa: cancelData.justificativa,
      cancelamento_data: new Date().toISOString()
    };

    if (isGuest) {
      const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
      const updated = saved.map((a: any) => a.id === selectedAppointment.id ? { ...a, ...update } : a);
      localStorage.setItem('demo_appointments', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } else if (firestore) {
      updateDoc(doc(firestore, 'agendamentos', selectedAppointment.id), update);
    }

    setIsCancelDialogOpen(false);
    setSelectedAppointment(null);
    toast({ title: "Agendamento Cancelado" });
  };

  const handleOpenReschedule = (apt: Appointment) => {
    if (apt.status === 'realizado') {
      toast({ variant: "destructive", title: "Ação Bloqueada" });
      return;
    }
    setEditingAppointmentId(apt.id);
    setIsDialogTriggerFromGrid(false);
    const dt = normalizeDate(apt.data_hora) || new Date();
    setFormData({
      paciente_id: apt.paciente_id || '',
      paciente_nome: apt.paciente_nome,
      convenio_id: apt.convenio_id,
      isBlockage: apt.status === 'bloqueado',
      motivo_bloqueio: apt.motivo_bloqueio || '',
      startTime: apt.time || format(dt, 'HH:mm'),
      endTime: apt.endTime || '',
      profissional_id: apt.profissional_id,
      data: format(dt, 'yyyy-MM-dd'),
      recorrencia: apt.recorrencia_tipo || 'nenhuma'
    });
    setIsDialogOpen(true);
  };

  const handleDeleteAppointment = () => {
    if (!selectedAppointment || !deleteJustification.trim()) {
      toast({ variant: "destructive", title: "Justificativa Obrigatória" });
      return;
    }
    if (isGuest) {
      const saved = JSON.parse(localStorage.getItem('demo_appointments') || '[]');
      const updated = saved.filter((a: any) => a.id !== selectedAppointment.id);
      localStorage.setItem('demo_appointments', JSON.stringify(updated));
      window.dispatchEvent(new Event('storage'));
    } else if (firestore) {
      deleteDoc(doc(firestore, 'agendamentos', selectedAppointment.id));
      logAction(firestore, {
        userId: user?.uid || 'anon',
        userName: user?.nome || 'Admin',
        action: 'Exclusão de Agendamento',
        module: 'Agenda',
        details: `Paciente: ${selectedAppointment.paciente_nome}. Justificativa: ${deleteJustification}`
      });
    }
    setIsDeleteConfirmOpen(false);
    setDeleteJustification('');
    setSelectedAppointment(null);
    toast({ title: "Agendamento excluído" });
  };

  const renderCard = (apt: Appointment) => {
    const prof = professionals?.find(u => u.uid === apt.profissional_id);
    const isBlock = apt.status === 'bloqueado';
    const planName = plans?.find(p => p.id === apt.convenio_id)?.nome || 'Particular';
    const isFinalized = apt.status === 'realizado';
    const isConflict = apt.conflito_com_bloqueio;
    const aptTime = normalizeDate(apt.data_hora) || new Date();
    const isAtrasado = !isFinalized && !isBlock && apt.status !== 'atendimento' && isAfter(new Date(), addMinutes(aptTime, 10));

    const nameToShow = isBlock ? (apt.motivo_bloqueio || 'BLOQUEIO') : apt.paciente_nome;

    const statusBgClasses: Record<string, string> = {
      agendado: isAtrasado ? "bg-rose-50 border-rose-200" : (isConflict ? "bg-rose-50 border-rose-300" : "bg-white border-slate-100"),
      aguardando_retorno: "bg-indigo-50/40 border-indigo-100",
      aguardando_confirmacao: "bg-amber-50/30 border-amber-100",
      confirmado: isAtrasado ? "bg-rose-50 border-rose-200" : "bg-teal-50/40 border-teal-100",
      espera: "bg-amber-50/60 border-amber-100",
      atendimento: "bg-emerald-50 border-emerald-200",
      realizado: "bg-slate-100 border-slate-200 opacity-80",
      faltou: "bg-rose-50/60 border-rose-200",
      cancelado: "bg-rose-50/20 border-dashed border-rose-200 opacity-60",
      bloqueado: "bg-slate-100 border-dashed border-slate-300"
    };

    return (
      <div 
        key={apt.id} 
        onClick={() => { setSelectedAppointment(apt); setIsInfoDialogOpen(true); }}
        className={cn(
          "relative flex items-center gap-4 py-2 px-4 rounded-2xl shadow-sm border transition-all cursor-pointer overflow-hidden group w-full min-h-[72px]",
          statusBgClasses[apt.status] || "bg-white border-slate-100",
          isConflict && "ring-2 ring-rose-400 ring-inset"
        )}
      >
        <div className="absolute top-0 left-0 bottom-0 w-1.5" style={{ backgroundColor: prof?.cor_agenda || '#4F6D7A' }} />
        
        <div className="flex flex-col items-start gap-1 shrink-0 w-16">
          <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">HORÁRIO</span>
          <span className={cn("text-xs font-black tabular-nums leading-none mt-1", isAtrasado ? "text-rose-600" : "text-slate-700")}>
            {apt.time || format(normalizeDate(apt.data_hora)!, 'HH:mm')}
          </span>
          <Badge className={cn("text-[6px] font-black uppercase py-0 h-3.5 px-1.5 rounded-full", isConflict ? "bg-rose-500 text-white" : (isAtrasado ? "bg-rose-500 text-white animate-pulse" : "bg-slate-100 text-slate-600"))}>
            {isConflict ? 'CONFLITO' : (isAtrasado ? 'ATRASO' : apt.status.replace('_', ' '))}
          </Badge>
        </div>

        <div className="flex-1 min-w-0">
          <h4 className={cn("text-xs font-black uppercase leading-tight truncate", isAtrasado || isConflict ? "text-rose-800" : "text-primary")}>{nameToShow}</h4>
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">
            {isBlock ? `${apt.time} - ${apt.endTime}` : planName}
          </span>
        </div>

        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-slate-300 hover:bg-slate-50"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 shadow-2xl bg-white border-none ring-1 ring-border">
              {isBlock ? (
                <DropdownMenuItem onClick={() => handleOpenReschedule(apt)} className="rounded-xl py-2.5 cursor-pointer gap-3 text-blue-600 font-bold text-xs"><CalendarIcon className="h-4 w-4" /> Editar Bloqueio</DropdownMenuItem>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => handleWhatsAppAction(apt)} className="rounded-xl py-2.5 cursor-pointer gap-3 text-emerald-600 font-bold text-xs"><MessageSquare className="h-4 w-4" /> WhatsApp Lembrete</DropdownMenuItem>
                  {!isFinalized && (
                    <>
                      <DropdownMenuItem onClick={() => handleAction(apt, 'confirmado')} className="rounded-xl py-2.5 cursor-pointer gap-3 text-teal-600 font-bold text-xs"><Check className="h-4 w-4" /> Confirmar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction(apt, 'espera')} className="rounded-xl py-2.5 cursor-pointer gap-3 text-amber-600 font-bold text-xs"><MapPin className="h-4 w-4" /> Check-in</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleOpenReschedule(apt)} className="rounded-xl py-2.5 cursor-pointer gap-3 text-blue-600 font-bold text-xs"><CalendarIcon className="h-4 w-4" /> Reagendar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction(apt, 'cancelado')} className="rounded-xl py-2.5 cursor-pointer gap-3 text-rose-600 font-bold text-xs"><XCircle className="h-4 w-4" /> Cancelar</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction(apt, 'faltou')} className="rounded-xl py-2.5 cursor-pointer gap-3 text-orange-600 font-bold text-xs"><UserX className="h-4 w-4" /> Falta</DropdownMenuItem>
                      <DropdownMenuSeparator className="my-1" />
                      <DropdownMenuItem onClick={() => handleAction(apt, 'atendimento')} className="rounded-xl py-2.5 cursor-pointer gap-3 text-slate-600 font-bold text-xs"><Play className="h-4 w-4" /> Iniciar Atendimento</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAction(apt, 'realizado')} className="rounded-xl py-2.5 cursor-pointer gap-3 text-blue-600 font-bold text-xs"><Square className="h-4 w-4" /> Finalizar</DropdownMenuItem>
                    </>
                  )}
                </>
              )}
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem onClick={() => handleUndoStep(apt)} disabled={!apt.status_anterior} className="rounded-xl py-2.5 cursor-pointer gap-3 text-indigo-600 font-bold text-xs"><RotateCcw className="h-4 w-4" /> Estornar</DropdownMenuItem>
              {isGestor && (
                <DropdownMenuItem onClick={() => { setSelectedAppointment(apt); setIsDeleteConfirmOpen(true); }} className="rounded-xl py-2.5 cursor-pointer gap-3 text-rose-800 font-black text-[10px] uppercase"><Trash2 className="h-4 w-4" /> EXCLUIR</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  const renderSlot = (item: any, date: Date) => {
    if (item.type === 'break') {
      return (
        <div key={`${date.toISOString()}-${item.id}`} className="relative flex items-center justify-between min-h-[72px] px-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200 opacity-60 w-full">
          <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-slate-300" />
          <div className="flex items-center gap-4">
             <span className="text-[10px] font-black text-slate-400">{item.start} - {item.end}</span>
             <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{item.label}</h4>
          </div>
        </div>
      );
    }

    const time = item.time;
    const slotMins = timeToMinutes(time);
    const dayNames = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const dayName = dayNames[date.getDay()];
    
    const workingProfs = (professionals || []).filter(p => settings?.workingHours?.[dayName]?.active);
    const relevantProfs = selectedProfessionalId === 'all' ? workingProfs : workingProfs.filter(p => p.uid === selectedProfessionalId);

    const slotApts = appointments.filter(a => {
      if (!a.data_hora) return false;
      const d = normalizeDate(a.data_hora);
      if (!d) return false;
      return isSameDay(d, date) && (a.time === time || format(d, 'HH:mm') === time) && (selectedProfessionalId === 'all' || a.profissional_id === selectedProfessionalId);
    });

    if (slotApts.length > 0) {
      return (
        <div key={`${date.toISOString()}-${time}-container`} className="flex flex-col gap-2 w-full">
          {slotApts.map(apt => renderCard(apt))}
        </div>
      );
    }

    const profsInsideBlockage = relevantProfs.filter(p => {
      return appointments.some(a => {
        if (a.status !== 'bloqueado' || !a.data_hora || a.profissional_id !== p.uid) return false;
        const d = normalizeDate(a.data_hora);
        if (!d || !isSameDay(d, date)) return false;
        const aptStartMins = timeToMinutes(a.time || format(d, 'HH:mm'));
        const aptEndMins = timeToMinutes(a.endTime || "23:59");
        return (slotMins > aptStartMins && slotMins < aptEndMins);
      });
    });

    if (relevantProfs.length > 0 && profsInsideBlockage.length === relevantProfs.length) {
      return <div key={`${date.toISOString()}-${time}-overlap`} className="min-h-[72px] w-full flex items-center justify-center opacity-20"><div className="w-0.5 h-full bg-slate-300" /></div>;
    }

    return (
      <div 
        key={`${date.toISOString()}-${time}`}
        onClick={() => { 
          setEditingAppointmentId(null);
          setIsDialogTriggerFromGrid(true);
          setFormData({
            ...formData,
            paciente_id: '',
            isBlockage: false,
            startTime: time,
            data: format(date, 'yyyy-MM-dd'),
            profissional_id: selectedProfessionalId === 'all' ? (relevantProfs.find(p => !profsInsideBlockage.includes(p))?.uid || workingProfs?.[0]?.uid || '') : selectedProfessionalId
          });
          setIsDialogOpen(true); 
        }}
        className="flex items-center justify-center min-h-[72px] py-2 rounded-2xl border-2 border-dashed border-slate-100 hover:border-primary/20 hover:bg-white transition-all group cursor-pointer bg-slate-50/20 w-full"
      >
         <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-primary/60">{time} - LIVRE</span>
      </div>
    );
  };

  const days = useMemo(() => {
    if (viewMode === 'daily') return [currentDate];
    const start = startOfWeek(currentDate, { weekStartsOn: 0 });
    const end = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentDate, viewMode]);

  const unifiedTimes = useMemo(() => {
    const timesSet = new Set<string>();
    days.forEach(day => {
      getTimeSlotsForDay(day).forEach(s => timesSet.add(s.time));
      appointments.forEach(a => {
        const d = normalizeDate(a.data_hora);
        if (d && isSameDay(d, day) && (selectedProfessionalId === 'all' || a.profissional_id === selectedProfessionalId)) {
          timesSet.add(a.time || format(d, 'HH:mm'));
        }
      });
    });
    return Array.from(timesSet).sort();
  }, [days, appointments, selectedProfessionalId, settings]);

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in duration-700 pb-20 max-w-[1800px] mx-auto overflow-x-hidden px-1">
      <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6 bg-white p-4 md:p-6 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border-none ring-1 ring-border">
          <div className="flex items-center gap-4">
             <div className="h-10 w-10 md:h-12 md:w-12 rounded-2xl bg-primary flex items-center justify-center text-white shadow-lg shrink-0"><CalendarIcon className="h-5 w-5 md:h-6 md:w-6" /></div>
             <div>
                <h1 className="text-lg md:text-2xl font-headline font-bold text-primary truncate uppercase">
                  {viewMode === 'daily' ? format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR }) : format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                   <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(currentDate, viewMode === 'daily' ? 1 : 7))} className="h-8 w-8 rounded-full"><ChevronLeft className="h-4 w-4" /></Button>
                   <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())} className="h-6 px-3 rounded-full text-[9px] font-black uppercase">Ir para hoje</Button>
                   <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(currentDate, viewMode === 'daily' ? 1 : 7))} className="h-8 w-8 rounded-full"><ChevronRight className="h-4 w-4" /></Button>
                </div>
             </div>
          </div>

          <Button 
            onClick={() => {
              setEditingAppointmentId(null);
              setIsDialogTriggerFromGrid(false);
              setFormData({ ...formData, paciente_id: '', isBlockage: false, data: format(new Date(), 'yyyy-MM-dd'), profissional_id: selectedProfessionalId === 'all' ? (professionals?.[0]?.uid || '') : selectedProfessionalId });
              setIsDialogOpen(true);
            }}
            variant="outline" 
            className="rounded-full border-primary/20 text-primary font-black uppercase text-[10px] tracking-widest flex h-11"
          >
            <Plus className="h-4 w-4 mr-2" /> Novo Agendamento
          </Button>

          <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
            <Select value={selectedProfessionalId} onValueChange={setSelectedProfessionalId}>
              <SelectTrigger className="w-full md:w-56 h-11 rounded-xl bg-sidebar-accent border-none font-bold text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Visão Geral (Todos)</SelectItem>
                {professionals?.map(p => (
                  <SelectItem key={p.uid} value={p.uid}>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: p.cor_agenda || '#4F6D7A' }} /> {p.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <TabsList className="bg-slate-100 p-1 rounded-xl h-11 shadow-inner w-full md:w-auto">
               <TabsTrigger value="daily" className="text-[10px] font-black uppercase rounded-lg h-full px-6">Dia</TabsTrigger>
               <TabsTrigger value="weekly" className="text-[10px] font-black uppercase rounded-lg h-full px-6">Semana</TabsTrigger>
               <TabsTrigger value="google" className="text-[10px] font-black uppercase rounded-lg h-full px-6 gap-2"><Globe className="h-3 w-3" /> Google</TabsTrigger>
            </TabsList>
          </div>
        </div>

        <div className="mt-6 md:mt-8">
          <TabsContent value="daily">
             {checkIsBlockingHoliday(currentDate) ? (
                <div className="h-[500px] bg-rose-50/30 rounded-[2.5rem] flex flex-col items-center justify-center border-2 border-dashed border-rose-200">
                   <CalendarOff className="h-12 w-12 text-rose-300 mb-4" />
                   <VerticalText text="SEM EXPEDIENTE" />
                   <p className="font-black text-rose-500 uppercase text-xl mt-4">{checkIsBlockingHoliday(currentDate)?.nome}</p>
                </div>
             ) : (
               <div className="flex flex-col gap-3 max-w-3xl mx-auto w-full px-2">
                  {(() => {
                    const baseSlots = getTimeSlotsForDay(currentDate);
                    const dayApts = appointments.filter(a => {
                      const d = normalizeDate(a.data_hora);
                      return d && isSameDay(d, currentDate) && (selectedProfessionalId === 'all' || a.profissional_id === selectedProfessionalId);
                    });
                    const unifiedSlots = [...baseSlots];
                    dayApts.forEach(apt => {
                       const d = normalizeDate(apt.data_hora);
                       const aptTime = apt.time || (d ? format(d, 'HH:mm') : null);
                       if (aptTime && !unifiedSlots.some(s => s.time === aptTime)) unifiedSlots.push({ type: 'slot', time: aptTime });
                    });
                    unifiedSlots.sort((a, b) => (a.time || a.start).localeCompare(b.time || b.start));
                    return unifiedSlots.map(item => renderSlot(item, currentDate));
                  })()}
               </div>
             )}
          </TabsContent>

          <TabsContent value="weekly">
            <div className="overflow-x-auto pb-4 scrollbar-none">
              <div className="min-w-[1200px] flex gap-4 px-2">
                {days.map(day => {
                   const blockingHoliday = checkIsBlockingHoliday(day);
                   const isNoService = !!blockingHoliday || !settings?.workingHours?.[['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'][day.getDay()]]?.active;
                   return (
                     <div key={day.toISOString()} className={cn("flex flex-col gap-2 transition-all", isNoService ? "w-24 opacity-60" : "flex-1")}>
                       <div className="text-center py-4 bg-white rounded-[1.5rem] shadow-sm ring-1 ring-border">
                          <p className="text-[10px] font-black text-muted-foreground uppercase">{format(day, 'EEEE', { locale: ptBR }).split('-')[0]}</p>
                          <p className={cn("text-xl font-black", isSameDay(day, new Date()) ? "text-accent" : "text-primary")}>{format(day, 'dd')}</p>
                       </div>
                       <div className="flex flex-col gap-2 flex-1 min-h-[600px] relative">
                         {isNoService ? (
                           <div className="absolute inset-0 bg-rose-50/10 rounded-[1.5rem] border border-dashed border-rose-100 flex items-center justify-center"><VerticalText text="FECHADO" className="text-rose-300" /></div>
                         ) : (
                           unifiedTimes.map(time => {
                             const daySlots = getTimeSlotsForDay(day);
                             const item = daySlots.find(s => s.time === time);
                             const manualApts = appointments.filter(a => {
                               const d = normalizeDate(a.data_hora);
                               return d && isSameDay(d, day) && (a.time === time || format(d, 'HH:mm') === time) && (selectedProfessionalId === 'all' || a.profissional_id === selectedProfessionalId);
                             });
                             if (manualApts.length > 0 || item) return renderSlot(manualApts.length > 0 ? { time } : item, day);
                             return <div key={`${day.toISOString()}-${time}`} className="bg-slate-50/10 rounded-2xl border border-dashed border-slate-100 opacity-20 min-h-[72px]" />;
                           })
                         )}
                       </div>
                     </div>
                   );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="google">
             <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden h-[700px]">
                {settings?.google_calendar_url ? <iframe src={settings.google_calendar_url} width="100%" height="100%" frameBorder="0" title="Google Calendar" /> : <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-40"><Globe className="h-12 w-12 mb-4" /><p className="font-bold">Integração não configurada</p></div>}
             </Card>
          </TabsContent>
        </div>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] rounded-[2.5rem] p-0 border-none shadow-3xl overflow-hidden bg-white">
          <DialogHeader className="p-8 bg-primary/10 border-b">
             <DialogTitle className="text-2xl font-headline font-bold text-primary flex items-center gap-3"><PlusCircle className="h-6 w-6" /> Registro de Agenda</DialogTitle>
          </DialogHeader>
          <div className="p-8 space-y-6">
             <div className="bg-slate-100 p-1.5 rounded-2xl flex max-w-md mx-auto">
                <button onClick={() => setFormData(prev => ({...prev, isBlockage: false}))} className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase", !formData.isBlockage ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}>Agendamento</button>
                <button onClick={() => setFormData(prev => ({...prev, isBlockage: true}))} className={cn("flex-1 py-3 rounded-xl text-[10px] font-black uppercase", formData.isBlockage ? "bg-white text-primary shadow-sm" : "text-muted-foreground")}>Bloqueio</button>
             </div>
             {!formData.isBlockage ? (
               <div className="space-y-4">
                 <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase tracking-widest ml-1">Paciente</Label>
                    <Select value={formData.paciente_id} onValueChange={(v) => {
                      const p = patients?.find(p => p.id === v);
                      setFormData(prev => ({ ...prev, paciente_id: v, paciente_nome: p?.nome || '', convenio_id: p?.convenio_id || 'particular' }));
                    }}><SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-bold"><SelectValue placeholder="Escolha um paciente..." /></SelectTrigger><SelectContent>{patients?.map(p => (<SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>))}</SelectContent></Select>
                 </div>
                 <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase tracking-widest ml-1">Convênio / Plano</Label>
                    <Select value={formData.convenio_id} onValueChange={(v) => setFormData(prev => ({...prev, convenio_id: v}))}><SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-bold"><SelectValue /></SelectTrigger><SelectContent>{plans?.map(p => (<SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>))}</SelectContent></Select>
                 </div>
               </div>
             ) : (
               <div className="space-y-1.5"><div className="flex items-center justify-between px-1"><Label className="text-[9px] font-black uppercase tracking-widest">Motivo do Bloqueio</Label><button onClick={handleAddNewMotivo} className="text-[9px] font-black uppercase text-accent hover:underline">+ Novo</button></div>
                  <Select value={formData.motivo_bloqueio} onValueChange={(v) => setFormData(prev => ({...prev, motivo_bloqueio: v}))}><SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-bold"><SelectValue placeholder="Escolha um motivo..." /></SelectTrigger><SelectContent>{(settings?.motivos_bloqueio || ['Almoço', 'Reunião', 'Particular', 'Viagem']).map(m => (<SelectItem key={m} value={m}>{m}</SelectItem>))}</SelectContent></Select>
               </div>
             )}
             <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase tracking-widest ml-1">Médico Responsável</Label>
                <Select value={formData.profissional_id} onValueChange={(v) => setFormData(prev => ({...prev, profissional_id: v}))}><SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-bold"><SelectValue /></SelectTrigger><SelectContent>{professionals?.map(p => (<SelectItem key={p.uid} value={p.uid}>{p.nome}</SelectItem>))}</SelectContent></Select>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-dashed">
               <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase tracking-widest">Data</Label><Input type="date" className="h-14 rounded-2xl bg-slate-50 border-none font-black" value={formData.data} onChange={(e) => setFormData(prev => ({...prev, data: e.target.value}))} /></div>
               <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase tracking-widest">Início</Label>
                  {formData.isBlockage ? <Input type="time" className="h-14 rounded-2xl bg-slate-50 border-none font-black" value={formData.startTime} onChange={(e) => setFormData(prev => ({...prev, startTime: e.target.value}))} /> : <Select value={formData.startTime} onValueChange={(v) => setFormData(prev => ({...prev, startTime: v}))}><SelectTrigger className="h-14 rounded-2xl bg-slate-50 border-none font-black"><SelectValue placeholder="00:00" /></SelectTrigger><SelectContent>{availableSlots.map(t => (<SelectItem key={t} value={t} className="font-black tabular-nums">{t}</SelectItem>))}</SelectContent></Select>}
               </div>
               <div className="space-y-1.5"><Label className="text-[9px] font-black uppercase tracking-widest">Término</Label><Input disabled={!formData.isBlockage} type={formData.isBlockage ? "time" : "text"} className="h-14 rounded-2xl border-none font-black bg-slate-100" value={formData.endTime} onChange={(e) => setFormData(prev => ({...prev, endTime: e.target.value}))} /></div>
             </div>
          </div>
          <DialogFooter className="p-8 bg-slate-50 border-t flex flex-row items-center gap-6"><button onClick={() => setIsDialogOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex-1">Cancelar</button><Button className="bg-primary h-16 px-10 rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-2xl flex-[2]" onClick={handleSaveAppointment}><Save className="h-4 w-4 mr-3" />{formData.isBlockage ? 'Confirmar Bloqueio' : 'Confirmar Registro'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isInfoDialogOpen} onOpenChange={setIsInfoDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] rounded-[2.5rem] p-0 border-none shadow-3xl overflow-hidden bg-white">
          <div className="sr-only"><DialogTitle>Informações do Agendamento</DialogTitle></div>
          {selectedAppointment && (
            <>
              <div className={cn("p-8 md:p-10 text-white flex items-center justify-between relative", selectedAppointment.status === 'bloqueado' ? "bg-slate-700" : "bg-primary")}>
                <div className="flex items-center gap-6 z-10">
                  <div className="h-16 w-16 md:h-20 md:w-20 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border-2 border-white/30">{selectedAppointment.status === 'bloqueado' ? <Ban className="h-8 w-8" /> : <UserIcon className="h-8 w-8" />}</div>
                  <div className="space-y-1">
                    <DialogTitle className="text-xl md:text-3xl font-headline font-bold uppercase">{selectedAppointment.status === 'bloqueado' ? (selectedAppointment.motivo_bloqueio || 'BLOQUEIO') : selectedAppointment.paciente_nome}</DialogTitle>
                    <div className="flex gap-2"><Badge variant="outline" className="bg-white/10 text-white border-white/20 text-[8px] font-black uppercase py-1">{selectedAppointment.status}</Badge></div>
                  </div>
                </div>
                <div className="text-right z-10 hidden sm:block"><p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">SESSÃO EM</p><p className="text-4xl font-black tabular-nums">{selectedAppointment.time}</p></div>
              </div>
              <div className="p-8 md:p-10 space-y-8">
                {selectedAppointment.status === 'bloqueado' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="p-6 bg-slate-50 rounded-3xl border border-dashed"><Label className="text-[8px] font-black uppercase text-muted-foreground/60 block mb-1">Médico Responsável</Label><p className="text-sm font-bold text-slate-700">{professionals?.find(p => p.uid === selectedAppointment.profissional_id)?.nome}</p></div>
                    <div className="p-6 bg-slate-50 rounded-3xl border border-dashed"><Label className="text-[8px] font-black uppercase text-muted-foreground/60 block mb-1">Período</Label><p className="text-sm font-bold text-slate-700">{selectedAppointment.time} até {selectedAppointment.endTime}</p></div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <h3 className="text-[10px] font-black uppercase text-primary tracking-[0.2em] flex items-center gap-2"><History className="h-3.5 w-3.5" /> Timeline Operacional</h3>
                    <div className="grid grid-cols-3 gap-4">
                       <div className="flex flex-col items-center p-6 rounded-3xl border-2 border-slate-50"><Label className="text-[7px] font-black uppercase text-muted-foreground/60 mb-2">Check-in</Label><span className="text-xs font-black">{selectedAppointment.chegada_horario ? format(normalizeDate(selectedAppointment.chegada_horario)!, 'HH:mm') : '--:--'}</span></div>
                       <div className="flex flex-col items-center p-6 rounded-3xl border-2 border-slate-50"><Label className="text-[7px] font-black uppercase text-muted-foreground/60 mb-2">Início</Label><span className="text-xs font-black">{selectedAppointment.inicio_atendimento ? format(normalizeDate(selectedAppointment.inicio_atendimento)!, 'HH:mm') : '--:--'}</span></div>
                       <div className="flex flex-col items-center p-6 rounded-3xl border-2 border-slate-50"><Label className="text-[7px] font-black uppercase text-muted-foreground/60 mb-2">Término</Label><span className="text-xs font-black">{selectedAppointment.fim_atendimento ? format(normalizeDate(selectedAppointment.fim_atendimento)!, 'HH:mm') : '--:--'}</span></div>
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="p-6 md:p-8 bg-slate-50 border-t flex flex-row gap-4"><button className="h-14 flex-1 rounded-2xl font-black uppercase text-[10px] text-muted-foreground" onClick={() => setIsInfoDialogOpen(false)}>Fechar</button><Button className="bg-primary h-14 flex-[2] rounded-2xl font-black uppercase text-[10px] tracking-widest gap-2 shadow-xl" onClick={() => { setIsInfoDialogOpen(false); handleOpenReschedule(selectedAppointment); }}><Settings2 className="h-4 w-4" /> {selectedAppointment.status === 'bloqueado' ? 'Editar Bloqueio' : 'Reagendar'}</Button></DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}><DialogContent className="max-w-md rounded-3xl"><DialogHeader><DialogTitle className="text-2xl font-headline text-rose-600 flex items-center gap-3"><Ban className="h-6 w-6" /> Cancelar Consulta</DialogTitle></DialogHeader><div className="py-6 space-y-6"><div className="space-y-3"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Origem do Cancelamento</Label><RadioGroup value={cancelData.origem} onValueChange={(val: any) => setCancelData(prev => ({...prev, origem: val}))} className="grid grid-cols-2 gap-3"><div className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all cursor-pointer", cancelData.origem === 'paciente' ? "border-primary bg-primary/5" : "border-slate-100")} onClick={() => setCancelData(prev => ({...prev, origem: 'paciente'}))}><UserIcon className="h-5 w-5" /><span className="text-[10px] font-bold uppercase">Paciente</span></div><div className={cn("flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all cursor-pointer", cancelData.origem === 'profissional' ? "border-primary bg-primary/5" : "border-slate-100")} onClick={() => setCancelData(prev => ({...prev, origem: 'profissional'}))}><Stethoscope className="h-5 w-5" /><span className="text-[10px] font-bold uppercase">Clínica</span></div></RadioGroup></div><div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-dashed"><div className="space-y-0.5"><p className="text-xs font-bold text-slate-700">Cobrar Consulta?</p><p className="text-[9px] text-muted-foreground uppercase font-black">Gerar lançamento financeiro</p></div><Switch checked={cancelData.cobrar} onCheckedChange={(val) => setCancelData(prev => ({...prev, cobrar: val}))} /></div><div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Justificativa</Label><Textarea placeholder="Motivo..." className="min-h-[100px] rounded-2xl" value={cancelData.justificativa} onChange={(e) => setCancelData(prev => ({...prev, justificativa: e.target.value}))} /></div></div><DialogFooter className="flex flex-row gap-3"><button className="flex-1 font-black uppercase text-[10px]" onClick={() => setIsCancelDialogOpen(false)}>Voltar</button><Button className="flex-[2] bg-rose-600 h-12 rounded-xl font-black uppercase text-[10px]" onClick={handleConfirmCancel}>Confirmar Cancelamento</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}><DialogContent className="max-w-md rounded-3xl"><DialogHeader><DialogTitle className="text-2xl font-headline text-rose-800 flex items-center gap-3"><Trash2 className="h-6 w-6" /> Excluir Registro</DialogTitle><DialogDescription>Esta ação é irreversível e exige justificativa para auditoria.</DialogDescription></DialogHeader><div className="py-6 space-y-4"><div className="p-4 bg-rose-50 rounded-2xl border border-rose-100 text-rose-800 space-y-1"><p className="text-[10px] font-black uppercase opacity-60">Alvo</p><p className="font-bold">{selectedAppointment?.paciente_nome}</p></div><div className="space-y-1.5"><Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Motivo da Exclusão (Auditoria)</Label><Textarea placeholder="Por que este registro está sendo removido?" className="min-h-[100px] rounded-2xl border-rose-100" value={deleteJustification} onChange={(e) => setDeleteJustification(e.target.value)} /></div></div><DialogFooter className="flex flex-row gap-3"><button className="flex-1 font-black uppercase text-[10px]" onClick={() => setIsDeleteConfirmOpen(false)}>Cancelar</button><Button className="bg-rose-800 h-12 rounded-xl font-black uppercase text-[10px]" onClick={handleDeleteAppointment}>Excluir Agora</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
