import { auth, db, doc, setDoc, serverTimestamp, state, toast, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile,
  updatePassword, EmailAuthProvider, reauthenticateWithCredential, linkWithCredential } from './state.js';
import { $ } from './utils.js';

// Regra de senha forte: 8+ caracteres, ao menos 1 número e 1 caractere especial.
export function senhaForte(senha) {
  return /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(senha || '');
}
const MSG_SENHA_FRACA = 'A senha deve ter no mínimo 8 caracteres, incluindo um número e um caractere especial.';

const ERROS = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-not-found': 'Conta não encontrada.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Tente entrar.',
  'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).',
  'auth/missing-password': 'Informe a senha.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  'auth/requires-recent-login': 'Por segurança, confirme sua senha atual para continuar.'
};

export function traduzErro(e) { return ERROS[e?.code] || e?.message || 'Erro ao autenticar'; }

export function switchLoginTab(tab) {
  document.querySelectorAll('.login-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('loginGoogle').classList.toggle('hidden', tab !== 'google');
  $('loginEmail').classList.toggle('hidden', tab !== 'email');
}

export async function loginEmail() {
  const email = $('leEmail').value.trim();
  const senha = $('lePass').value;
  if (!email || !senha) return toast('Informe e-mail e senha');
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (e) { toast(traduzErro(e)); }
}

export async function cadastrarEmail() {
  const nome = $('leNome').value.trim();
  const email = $('leEmail').value.trim();
  const senha = $('lePass').value;
  if (!email || !senha) return toast('Informe e-mail e senha para criar a conta');
  if (!senhaForte(senha)) return toast(MSG_SENHA_FRACA);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    if (nome) await updateProfile(cred.user, { displayName: nome });
  } catch (e) { toast(traduzErro(e)); }
}

export function ehLoginEmail() {
  return (auth.currentUser?.providerData || []).some(p => p.providerId === 'password');
}

export async function alterarSenha() {
  const atual = $('perSenhaAtual').value;
  const nova = $('perSenhaNova').value;
  const confirma = $('perSenhaConfirma').value;
  if (!atual || !nova) return toast('Preencha a senha atual e a nova senha');
  if (!senhaForte(nova)) return toast(MSG_SENHA_FRACA);
  if (nova !== confirma) return toast('A confirmação não confere com a nova senha');
  try {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, atual);
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, nova);
    $('perSenhaAtual').value = ''; $('perSenhaNova').value = ''; $('perSenhaConfirma').value = '';
    toast('Senha alterada com sucesso');
  } catch (e) { toast(traduzErro(e)); }
}

// Contas Google não têm senha por padrão. Isso permite criar uma (vira também login por
// e-mail/senha), respeitando a mesma regra de senha forte usada no resto do sistema.
export async function criarSenhaGoogle() {
  const nova = $('perSenhaGoogleNova')?.value || '';
  const confirma = $('perSenhaGoogleConfirma')?.value || '';
  if (!senhaForte(nova)) return toast(MSG_SENHA_FRACA);
  if (nova !== confirma) return toast('A confirmação não confere com a nova senha');
  try {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, nova);
    await linkWithCredential(auth.currentUser, cred);
    await setDoc(doc(db, 'users', state.user.uid), { senhaGoogleCriada: true }, { merge: true });
    state.profile.senhaGoogleCriada = true;
    toast('Senha criada com sucesso! Agora você também pode entrar com e-mail e senha.');
    // precisaCriarSenhaGoogle() agora retorna false, mas a tela de bloqueio só é escondida pelo
    // fluxo de onAuthStateChanged — refresh() sozinho não mexe nela. Libera o acesso na hora.
    $('senhaLock').classList.add('hidden');
    $('app').classList.remove('hidden');
    window.App.refresh();
  } catch (e) { toast(traduzErro(e)); }
}

// Janela de tolerância: 1h após o primeiro acesso via Google sem senha, bloqueia o uso
// até a consultora criar uma senha (LGPD/segurança — evita depender só do login Google).
export function precisaCriarSenhaGoogle() {
  if (ehLoginEmail() || state.profile?.senhaGoogleCriada) return false;
  const criadoEm = state.profile?.criadoEm?.toDate ? state.profile.criadoEm.toDate() : null;
  if (!criadoEm) return false;
  return (Date.now() - criadoEm.getTime()) > 60 * 60 * 1000;
}

export async function resetPassword() {
  const email = $('leEmail').value.trim();
  if (!email) return toast('Informe seu e-mail para redefinir a senha');
  try {
    await sendPasswordResetEmail(auth, email);
    toast('E-mail de redefinição enviado. Confira sua caixa de entrada.');
  } catch (e) { toast(traduzErro(e)); }
}
