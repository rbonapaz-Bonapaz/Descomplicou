import { state, toast } from './state.js';
import { porGenero } from './utils.js';

// Trava de app por biometria (Face ID / digital / Windows Hello), local ao aparelho.
// Não substitui o login do Firebase: exige sessão já autenticada (Google ou e-mail/senha).
// Como não há backend para verificar a assinatura WebAuthn, isso funciona como um
// "cadeado" adicional no aparelho (padrão de apps bancários), não como autenticação remota.
const KEY_PREFIX = 'crmBio_';

function suportado() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

export async function biometriaDisponivel() {
  if (!suportado()) return false;
  try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch (e) { return false; }
}

function credKey(uid) { return KEY_PREFIX + uid; }

export function temBiometriaAtiva(uid) {
  return !!localStorage.getItem(credKey(uid));
}

function desafioAleatorio() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return arr;
}

function paraB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function deB64(b64) { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer; }

export async function ativarBiometria() {
  if (!(await biometriaDisponivel())) return toast('Biometria não disponível neste aparelho/navegador');
  const uid = state.user.uid;
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: desafioAleatorio(),
        rp: { name: 'FaroBella' },
        user: {
          id: new TextEncoder().encode(uid),
          name: state.user.email || uid,
          displayName: state.profile?.nome || state.user.displayName || porGenero(state.profile?.genero, { f: 'Consultora', m: 'Consultor', x: 'Consultor(a)' })
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    if (!cred) throw new Error('Cadastro cancelado');
    localStorage.setItem(credKey(uid), paraB64(cred.rawId));
    toast('Biometria ativada neste aparelho');
    return true;
  } catch (e) {
    toast('Não foi possível ativar: ' + (e.message || 'operação cancelada'));
    return false;
  }
}

export function desativarBiometria() {
  if (!state.user) return;
  localStorage.removeItem(credKey(state.user.uid));
  toast('Biometria desativada neste aparelho');
}

export async function desbloquearBiometria() {
  const uid = state.user?.uid;
  if (!uid) return false;
  const rawIdB64 = localStorage.getItem(credKey(uid));
  if (!rawIdB64) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: desafioAleatorio(),
        allowCredentials: [{ id: deB64(rawIdB64), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    return !!assertion;
  } catch (e) {
    return false;
  }
}
