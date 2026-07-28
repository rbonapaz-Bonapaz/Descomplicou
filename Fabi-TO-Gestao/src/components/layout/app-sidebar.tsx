"use client"

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  LogOut,
  Sparkles,
  Settings,
  Wallet,
  UserCheck,
  Clock,
  Sun,
  ShieldCheck,
  UserCog,
  Activity,
  CreditCard,
  ChevronDown,
  UserCircle,
  Monitor,
  Stethoscope,
  Building2
} from 'lucide-react';
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  useSidebar
} from '@/components/ui/sidebar';
import { 
  SheetHeader, 
  SheetTitle,
  SheetDescription 
} from '@/components/ui/sheet';
import { useAuth } from '@/components/providers/auth-provider';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

export function AppSidebar() {
  const { logout, user, clinica, pode, temPapel, identidade } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const renderIcon = (IconComponent: any) => {
    if (!mounted) return <div className="h-4 w-4" />;
    return <IconComponent className="h-4 w-4" />;
  };

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  if (!mounted) {
    return <div className="w-64 h-screen bg-sidebar-background border-r border-sidebar-border" />;
  }

  const normalizedPath = pathname?.endsWith('/') ? pathname : `${pathname}/`;

  // O menu segue a MESMA matriz que o `firestore.rules` aplica no servidor
  // (`src/lib/permissions.ts`). Assim o usuário nunca vê um atalho que resultaria
  // em erro de permissão ao clicar. Um módulo desligado pela clínica também some.
  const modulos = clinica?.modulos;
  const canSeeRecepcao = pode('recepcao.usar') && modulos?.recepcao !== false;
  const canSeeAgenda = pode('agenda.ler.propria') || pode('agenda.ler.todas');
  const canSeePacientes = pode('paciente.ler');
  const canSeeProntuario = pode('prontuario.ler');
  const canSeeFinanceiro = pode('financeiro.ler') && modulos?.financeiro !== false;
  const canSeeInteligencia = pode('relatorios.ler') && modulos?.inteligencia !== false;
  const canSeeEquipe = pode('equipe.ler') && modulos?.rh !== false;
  const canSeeAprovacoes = pode('ponto.aprovar') && modulos?.ponto !== false;
  const canSeeConfig = pode('configuracoes.ler');
  const canSeePonto = modulos?.ponto !== false;
  const canSeeFerias = modulos?.ferias !== false;
  const rotuloPapel = temPapel('admin_clinica')
    ? 'Administração'
    : temPapel('profissional')
      ? 'Profissional'
      : temPapel('recepcao')
        ? 'Recepção'
        : temPapel('financeiro')
          ? 'Financeiro'
          : 'Equipe';

  return (
    <Sidebar collapsible="icon">
      {isMobile && (
        <div className="sr-only">
          <SheetHeader>
            <SheetTitle>Menu de Navegação</SheetTitle>
            <SheetDescription>{clinica?.nome || 'Prontta'}</SheetDescription>
          </SheetHeader>
        </div>
      )}

      <SidebarHeader className="py-6 border-b border-sidebar-border bg-sidebar-background">
        <div className="flex items-center gap-3 px-2 overflow-hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary shadow-lg shrink-0">
            <Sparkles className="h-6 w-6" />
          </div>
          <span className="font-headline text-lg font-bold tracking-tight text-white group-data-[collapsible=icon]:hidden whitespace-nowrap">
            {clinica?.nome || 'Prontta'}
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-sidebar-background pt-4 overflow-y-auto scrollbar-none">
        <SidebarGroup>
          <SidebarGroupLabel className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-4">Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={normalizedPath === '/dashboard/'} tooltip="Início" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                  <Link href="/dashboard/">
                    {renderIcon(LayoutDashboard)}
                    <span className="font-bold">Painel Inicial</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {canSeeRecepcao && (
                <Collapsible className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="text-white/80 hover:bg-white/10 h-11">
                        {renderIcon(UserCheck)}
                        <span className="font-bold">Recepção</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pl-9 space-y-1 py-1">
                        <Link href="/recepcao/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">Caixa & Fila</Link>
                        <Link href="/recepcao/tv/" target="_blank" className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">
                          {renderIcon(Monitor)} <span className="ml-2">Painel TV</span>
                        </Link>
                      </div>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {canSeeAgenda && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={normalizedPath === '/agenda/'} tooltip="Agenda" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                    <Link href="/agenda/">
                      {renderIcon(CalendarDays)}
                      <span className="font-bold">Agenda</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {canSeePacientes && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={normalizedPath === '/pacientes/'} tooltip="Pacientes" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                    <Link href="/pacientes/">
                      {renderIcon(Users)}
                      <span className="font-bold">Pacientes</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Prontuário é atalho exclusivo de quem atende — some para recepção
                  e para administrador que não é profissional de saúde. */}
              {canSeeProntuario && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={normalizedPath === '/pacientes/prontuario/'} tooltip="Prontuário" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                    <Link href="/pacientes/prontuario/">
                      {renderIcon(Stethoscope)}
                      <span className="font-bold">Prontuário</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-4">Minha Conta</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={normalizedPath === '/perfil/'} tooltip="Perfil" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                  <Link href="/perfil/">
                    {renderIcon(UserCircle)}
                    <span className="font-bold">Meu Perfil</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {canSeePonto && (
                <Collapsible className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="text-white/80 hover:bg-white/10 h-11">
                        {renderIcon(Clock)}
                        <span className="font-bold">Meu Ponto</span>
                        <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pl-9 space-y-1 py-1">
                        <Link href="/ponto/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">Registrar</Link>
                        <Link href="/ponto/espelho/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">Espelho</Link>
                      </div>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}

              {canSeeFerias && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={normalizedPath === '/ferias/'} tooltip="Férias" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                    <Link href="/ferias/">
                      {renderIcon(Sun)}
                      <span className="font-bold">Minhas Férias</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <Collapsible className="group/collapsible">
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton className="text-white/80 hover:bg-white/10 h-11">
                      {renderIcon(CreditCard)}
                      <span className="font-bold">Pagamentos</span>
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-9 space-y-1 py-1">
                      <Link href="/pagamento/envelope/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">Contracheque</Link>
                      <Link href="/pagamento/rendimentos/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">IR / Informe</Link>
                    </div>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Área do DONO DO SISTEMA. Não é a administração da clínica: quem entra
            aqui gerencia clínicas e planos, e não enxerga paciente de ninguém. */}
        {identidade.superadmin && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-4">Plataforma</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={normalizedPath.startsWith('/plataforma/')} tooltip="Clínicas" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                    <Link href="/plataforma/">
                      {renderIcon(Building2)}
                      <span className="font-bold">Clínicas e Planos</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {(canSeeFinanceiro || canSeeEquipe || canSeeAprovacoes || canSeeInteligencia || canSeeConfig) && (
          <SidebarGroup className="mt-4 mb-10">
            <SidebarGroupLabel className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] mb-2 px-4">Administração</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canSeeFinanceiro && (
                  <Collapsible className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="text-white/80 hover:bg-white/10 h-11">
                          {renderIcon(Wallet)}
                          <span className="font-bold">Financeiro</span>
                          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-9 space-y-1 py-1">
                          <Link href="/financeiro/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">Relatórios</Link>
                          <Link href="/despesas/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">Despesas</Link>
                          <Link href="/convenios/" onClick={handleLinkClick} className="flex h-9 items-center text-xs font-bold text-white/60 hover:text-white transition-colors">Operadoras</Link>
                        </div>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {canSeeAprovacoes && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={normalizedPath === '/rh/jornada/'} tooltip="Jornada" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                      <Link href="/rh/jornada/">
                        {renderIcon(ShieldCheck)}
                        <span className="font-bold">Aprovações</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {canSeeEquipe && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={normalizedPath === '/rh/equipe/'} tooltip="RH" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                      <Link href="/rh/equipe/">
                        {renderIcon(UserCog)}
                        <span className="font-bold">Equipe</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {canSeeInteligencia && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={normalizedPath === '/inteligencia/'} tooltip="Business" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                      <Link href="/inteligencia/">
                        {renderIcon(Activity)}
                        <span className="font-bold">Business Intelligence</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {canSeeConfig && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={normalizedPath === '/configuracoes/'} tooltip="Ajustes" className="text-white/80 hover:bg-white/10 h-11 data-[active=true]:bg-accent data-[active=true]:text-white" onClick={handleLinkClick}>
                      <Link href="/configuracoes/">
                        {renderIcon(Settings)}
                        <span className="font-bold">Ajustes</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 bg-sidebar-background flex flex-col gap-4">
        <div className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-2xl group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:justify-center">
           <Avatar className="h-9 w-9 border-2 border-white/10 shadow-sm shrink-0">
             <AvatarImage src={user?.foto_url} />
             <AvatarFallback className="bg-primary/20 text-white font-black text-xs">
                {user?.nome?.charAt(0) || 'U'}
             </AvatarFallback>
           </Avatar>
           <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="text-[11px] font-black text-white uppercase truncate leading-none mb-1">{user?.nome || 'Profissional'}</p>
              <Badge variant="outline" className="bg-accent/20 text-accent border-none text-[7px] font-black uppercase py-0 px-1.5 h-4">
                {identidade.superadmin ? 'Dono do sistema' : rotuloPapel}
              </Badge>
           </div>
        </div>

        <button 
          onClick={logout}
          className="flex items-center gap-3 px-3 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/40 hover:text-rose-400 rounded-xl transition-colors w-full"
        >
          {renderIcon(LogOut)}
          <span className="group-data-[collapsible=icon]:hidden">Encerrar Sessão</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}