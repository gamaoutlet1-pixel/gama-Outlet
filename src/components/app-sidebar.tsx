import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Home, Package, Upload, Boxes, Tag, Printer, Store, ArrowLeftRight, Settings, LogOut, FileText, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const groups = [
  {
    label: "Início",
    items: [
      { title: "Importar Planilha", url: "/importar", icon: Upload },
      { title: "Dashboard / Início", url: "/", icon: Home },
      { title: "Catálogo de Produtos", url: "/catalogo", icon: Package },
      { title: "Lotes", url: "/lotes", icon: Boxes },
    ],
  },
  {
    label: "Precificação",
    items: [
      { title: "Gestão de Preços", url: "/precos", icon: Tag },
      { title: "Gerador de Etiquetas", url: "/etiqueta-avulsa", icon: Printer },
    ],
  },
  {
    label: "ERP",
    items: [
      { title: "Tiny", url: "/tiny", icon: Store },
      { title: "Movimentações", url: "/movimentacoes", icon: ArrowLeftRight },
      { title: "Relatórios", url: "/relatorios", icon: FileText },
      { title: "Orçamento", url: "/orcamento", icon: ClipboardList },
    ],
  },
  {
    label: "Opções",
    items: [
      { title: "Configurações", url: "/configuracoes", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/auth", replace: true });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
            P
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Painel ML</div>
            <div className="text-xs text-muted-foreground">Operacional</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((it) => (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={pathname === it.url}>
                      <Link to={it.url} className="flex items-center gap-2">
                        <it.icon className="h-4 w-4" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut} className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
