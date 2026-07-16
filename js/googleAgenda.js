// Sincronização com o Google Agenda (Calendar). Como o app não tem backend, não guardamos um
// refresh token — o token de acesso concedido no popup dura ~1h. Enquanto válido, cada
// agendamento criado/editado/cancelado no CRM é espelhado num calendário dedicado no Google
// Agenda da consultora. Passado esse tempo, a próxima tentativa de sync falha silenciosamente
// (não trava o resto do app) e a consultora só precisa clicar em "Reconectar".
import { state, auth, db, doc, setDoc, GoogleAuthProvider, signInWithPopup, toast } from './state.js';

let accessToken = null;
let tokenExpiraEm = 0;

function tokenValido() {
  return accessToken && Date.now() < tokenExpiraEm;
}

export function googleAgendaConectada() {
  return !!state.profile?.googleCalendarId && tokenValido();
}

async function apiCalendar(path, options = {}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Erro ${r.status} na API do Google Agenda`);
  }
  return r.status === 204 ? null : r.json();
}

// Pede a permissão extra de Google Agenda (além do login normal) e cria/reaproveita um
// calendário dedicado com o nome escolhido pela consultora.
export async function conectarGoogleAgenda(nomeAgenda) {
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/calendar.events');
  provider.addScope('https://www.googleapis.com/auth/calendar.app.created');
  let result;
  try {
    result = await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked') throw new Error('Popup bloqueado pelo navegador. Permita popups e tente de novo.');
    throw new Error(e.message);
  }
  const cred = GoogleAuthProvider.credentialFromResult(result);
  if (!cred?.accessToken) throw new Error('Não recebi permissão do Google Agenda.');
  accessToken = cred.accessToken;
  tokenExpiraEm = Date.now() + 55 * 60 * 1000;

  let calendarId = state.profile?.googleCalendarId;
  if (!calendarId) {
    const cal = await apiCalendar('calendars', {
      method: 'POST',
      body: JSON.stringify({ summary: nomeAgenda || 'Agenda CRM' })
    });
    calendarId = cal.id;
  }

  await setDoc(doc(db, 'users', state.user.uid), {
    googleCalendarId: calendarId, nomeAgendaGoogle: nomeAgenda || 'Agenda CRM'
  }, { merge: true });
  state.profile = { ...state.profile, googleCalendarId: calendarId, nomeAgendaGoogle: nomeAgenda || 'Agenda CRM' };
  return calendarId;
}

export async function desconectarGoogleAgenda() {
  accessToken = null; tokenExpiraEm = 0;
  await setDoc(doc(db, 'users', state.user.uid), { googleCalendarId: '' }, { merge: true });
  state.profile = { ...state.profile, googleCalendarId: '' };
}

function eventoBody(a) {
  const inicio = a.hora ? `${a.data}T${a.hora}:00` : a.data;
  const usaHora = !!a.hora;
  // Duração real quando a consultora informou hora final (>= hora inicial); senão mantém o
  // padrão de 1h que já era usado antes de existir esse campo.
  const fim = a.horaFim && a.horaFim > a.hora ? `${a.data}T${a.horaFim}:00` : null;
  return {
    summary: `${a.tipo} — ${a.clienteNome}`,
    description: a.observacoes || '',
    location: a.local || '',
    start: usaHora ? { dateTime: new Date(inicio).toISOString() } : { date: a.data },
    end: usaHora
      ? { dateTime: fim ? new Date(fim).toISOString() : new Date(new Date(inicio).getTime() + 60 * 60000).toISOString() }
      : { date: a.data }
  };
}

// Cria ou atualiza o evento espelho no Google Agenda. Retorna o googleEventId (para salvar no
// agendamento) ou null se a sincronização não estiver ativa/o token tiver expirado — nesse caso
// não lança erro, só avisa, para não travar o fluxo normal do CRM.
export async function sincronizarAgendamento(a) {
  if (!googleAgendaConectada()) return null;
  try {
    const calendarId = state.profile.googleCalendarId;
    if (a.googleEventId) {
      await apiCalendar(`calendars/${encodeURIComponent(calendarId)}/events/${a.googleEventId}`, {
        method: 'PATCH', body: JSON.stringify(eventoBody(a))
      });
      return a.googleEventId;
    }
    const criado = await apiCalendar(`calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST', body: JSON.stringify(eventoBody(a))
    });
    return criado.id;
  } catch (e) {
    toast('Google Agenda: ' + e.message + ' — clique em Reconectar em Minha Conta.');
    return null;
  }
}

// Lista os eventos do calendário dedicado no Google (janela de -diasPassado a +diasFuturo a
// partir de hoje) — usado para puxar de volta pro CRM os eventos criados/editados direto no
// celular, completando o outro lado da sincronização (que hoje só ia CRM → Google).
export async function listarEventosGoogle(diasPassado = 7, diasFuturo = 90) {
  if (!googleAgendaConectada()) return [];
  const calendarId = state.profile.googleCalendarId;
  const timeMin = new Date(); timeMin.setDate(timeMin.getDate() - diasPassado);
  const timeMax = new Date(); timeMax.setDate(timeMax.getDate() + diasFuturo);
  try {
    const data = await apiCalendar(`calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&maxResults=250`);
    return data.items || [];
  } catch (e) {
    toast('Google Agenda: ' + e.message);
    return [];
  }
}

export async function removerEventoGoogle(a) {
  if (!googleAgendaConectada() || !a.googleEventId) return;
  try {
    await apiCalendar(`calendars/${encodeURIComponent(state.profile.googleCalendarId)}/events/${a.googleEventId}`, { method: 'DELETE' });
  } catch (e) { /* evento pode já ter sido removido do lado do Google — sem problema */ }
}
