import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  Pencil,
  Trash2,
  Plus,
  Loader2,
  Printer,
  Download,
  CheckCircle,
  Monitor,
  Cable,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listUsers,
  createUser,
  updateUserRole,
  deleteUser,
  type AppUser,
} from "@/lib/users.functions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { connectQz, listPrinters } from "@/lib/qzTrayPrint";
import { getQzCertificate } from "@/lib/qzTraySign";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: ConfiguracoesPage,
  head: () => ({ meta: [{ title: "Configurações — Painel ML" }] }),
});

function ConfiguracoesPage() {
  const [tema, setTema] = useState<"escuro" | "claro">("escuro");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { connected: boolean; printers: string[] } | null
  >(null);

  useEffect(() => {
    const saved = localStorage.getItem("tema");
    if (saved === "claro") {
      setTema("claro");
      document.documentElement.classList.remove("dark");
    } else {
      setTema("escuro");
      document.documentElement.classList.add("dark");
    }
  }, []);

  function applyTema(next: "escuro" | "claro") {
    setTema(next);
    if (next === "claro") {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
    localStorage.setItem("tema", next);
  }


  async function handleTestQz() {
    setTesting(true);
    setTestResult(null);
    try {
      await connectQz();
      const printers = await listPrinters();
      setTestResult({ connected: true, printers });
      toast.success(
        `QZ Tray conectado! ${printers.length} impressora(s) encontrada(s).`,
      );
    } catch (err: unknown) {
      setTestResult({ connected: false, printers: [] });
      toast.error(
        err instanceof Error
          ? err.message
          : "Falha ao conectar com QZ Tray",
      );
    } finally {
      setTesting(false);
    }
  }

  function handleDownloadCertificate() {
    try {
      const certPem = getQzCertificate();
      const blob = new Blob([certPem], { type: "application/x-pem-file" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gestao-lotes-ml.crt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Certificado baixado com sucesso!");
    } catch (err: unknown) {
      toast.error(
        "Erro ao gerar certificado: " +
          (err instanceof Error ? err.message : "falha"),
      );
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie integrações, dispositivos, usuários e aparência do sistema.
        </p>
      </div>

      <Tabs defaultValue="printer">
        <TabsList>
          <TabsTrigger value="printer">Impressora</TabsTrigger>
          <TabsTrigger value="users-appearance">Usuários & Aparência</TabsTrigger>
        </TabsList>

        <TabsContent value="printer" className="space-y-6">
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4 flex gap-3">
              <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Download className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-medium">1. Baixe o QZ Tray</h3>
                <p className="text-sm text-muted-foreground">
                  Acesse o site oficial e baixe o instalador para seu sistema (Windows, macOS ou Linux).
                </p>
                <Button size="sm" onClick={() => window.open("https://qz.io/download/", "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir Página de Download
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 flex gap-3">
              <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-medium">2. Instale o QZ Tray</h3>
                <p className="text-sm text-muted-foreground">
                  Execute o instalador baixado.
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                  <li><strong className="text-foreground">Windows:</strong> abra o arquivo .exe e siga o assistente de instalação.</li>
                  <li><strong className="text-foreground">macOS:</strong> abra o .pkg e arraste o QZ Tray para a pasta Applications.</li>
                  <li><strong className="text-foreground">Linux:</strong> execute o arquivo .run no terminal e siga as instruções.</li>
                </ul>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 flex gap-3">
              <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Cable className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-medium">3. Conecte a impressora ao computador</h3>
                <p className="text-sm text-muted-foreground">
                  Conecte a impressora via USB ou rede e instale os drivers conforme o fabricante.
                </p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                  <li>Verifique em Configurações → Dispositivos → Impressoras</li>
                  <li>Confirme que o status está "Pronta"</li>
                  <li>Faça uma impressão de teste pelo sistema operacional</li>
                </ul>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 flex gap-3">
              <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-medium">4. Instale o certificado no QZ Tray</h3>
                <Button size="sm" onClick={handleDownloadCertificate}>
                  <Download className="h-3.5 w-3.5" />
                  Baixar Certificado
                </Button>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-0.5">
                  <li>Clique no botão acima para baixar o arquivo gestao-lotes-ml.crt</li>
                  <li>Clique com o botão direito no ícone do QZ Tray na bandeja do sistema</li>
                  <li>Vá em "Advanced" → "Site Manager"</li>
                  <li>Clique em "+" ou "Add" para adicionar um novo certificado</li>
                  <li>Selecione o arquivo gestao-lotes-ml.crt que foi baixado</li>
                  <li>Confirme e feche a janela</li>
                </ol>
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 flex gap-3">
              <div className="shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="font-medium">5. Pronto! Teste a conexão</h3>
                <Button size="sm" onClick={handleTestQz} disabled={testing}>
                  {testing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Printer className="h-3.5 w-3.5" />
                  )}
                  Testar Conexão
                </Button>
                {testResult && (
                  <div className={`rounded-md border p-3 text-sm ${testResult.connected ? "border-green-600/30 bg-green-600/10 text-green-600" : "border-red-500/30 bg-red-500/10 text-red-500"}`}>
                    {testResult.connected ? (
                      <div className="space-y-1">
                        <p className="font-medium">Conectado com sucesso!</p>
                        <p>Impressoras detectadas:</p>
                        <ul className="list-disc list-inside">
                          {testResult.printers.map((p) => (
                            <li key={p}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p>Não foi possível conectar. Verifique se o QZ Tray está aberto e tente novamente.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Solução de Problemas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">QZ Tray não conecta:</strong>{" "}
                  Verifique se o ícone está na bandeja do sistema. Tente abrir pelo menu Iniciar. Desative temporariamente o antivírus ou firewall caso estejam bloqueando a comunicação.
                </p>
                <p>
                  <strong className="text-foreground">Impressora não aparece:</strong>{" "}
                  Verifique em Dispositivos e Impressoras se a impressora está instalada corretamente. Reinstale os drivers do fabricante se necessário.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Impressoras Compatíveis</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                <p>O sistema funciona com impressoras térmicas de etiquetas como Zebra, Argox, Elgin, TSC e similares.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users-appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Usuários</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <UsersSection />
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle>Aparência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label>Tema</Label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onClick={() => applyTema("escuro")}
                  className={`relative rounded-md border p-4 text-left transition-colors ${
                    tema === "escuro"
                      ? "border-primary ring-2 ring-primary/30 bg-accent/40"
                      : "border-border hover:bg-accent/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Escuro</span>
                    {tema === "escuro" && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Visual padrão do painel
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => applyTema("claro")}
                  className={`relative rounded-md border p-4 text-left transition-colors ${
                    tema === "claro"
                      ? "border-primary ring-2 ring-primary/30 bg-accent/40"
                      : "border-border hover:bg-accent/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Claro</span>
                    {tema === "claro" && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fundo claro com alto contraste
                  </p>
                </button>

              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersSection() {
  const listUsersFn = useServerFn(listUsers);
  const createUserFn = useServerFn(createUser);
  const updateUserRoleFn = useServerFn(updateUserRole);
  const deleteUserFn = useServerFn(deleteUser);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["usuarios"],
    queryFn: () => listUsersFn(),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<"Usuário" | "Administrador">("Usuário");
  const [newPassword, setNewPassword] = useState("");

  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [editRole, setEditRole] = useState<"Usuário" | "Administrador">("Usuário");

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: {
      email: string;
      password: string;
      role: "Usuário" | "Administrador";
    }) => createUserFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success("Usuário criado.");
      setAddOpen(false);
      setAddEmail("");
      setAddRole("Usuário");
      setNewPassword("");
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Falha ao criar usuário."),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { userId: string; role: "Usuário" | "Administrador" }) =>
      updateUserRoleFn({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success("Usuário atualizado.");
      setEditUser(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar usuário."),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => deleteUserFn({ data: { userId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast.success("Usuário excluído.");
      setDeleteTarget(null);
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Falha ao excluir usuário."),
  });

  function openEdit(u: AppUser) {
    setEditUser(u);
    setEditRole(u.role === "Administrador" ? "Administrador" : "Usuário");
  }

  return (
    <>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Adicionar usuário
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Perfil</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-6">
                <Loader2 className="h-4 w-4 animate-spin inline" />
              </TableCell>
            </TableRow>
          ) : error ? (
            (() => {
              const message = error instanceof Error ? error.message : String(error);
              const restricted = message.toLowerCase().includes("forbidden");
              return (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                    {restricted ? "Acesso restrito a administradores." : `Erro ao carregar usuários: ${message}`}
                  </TableCell>
                </TableRow>
              );
            })()
          ) : !data || data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                Nenhum usuário encontrado.
              </TableCell>
            </TableRow>
          ) : (
            data.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email ?? "—"}</TableCell>
                <TableCell>{u.email ?? "—"}</TableCell>
                <TableCell>{u.role}</TableCell>
                <TableCell>
                  {u.confirmed ? (
                    <Badge className="bg-green-600 hover:bg-green-600 text-white">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Pendente</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Editar"
                      onClick={() => openEdit(u)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Excluir"
                      onClick={() => setDeleteTarget(u)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Dialog open={addOpen} onOpenChange={(o) => { if (!createMutation.isPending) { setAddOpen(o); if (!o) setNewPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Usuário</DialogTitle>
            <DialogDescription>
              Uma senha temporária será gerada. O usuário poderá redefini-la posteriormente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="usuario@exemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Senha</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Senha do usuário"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-role">Perfil</Label>
              <Select
                value={addRole}
                onValueChange={(v) => setAddRole(v as "Usuário" | "Administrador")}
              >
                <SelectTrigger id="add-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Usuário">Usuário</SelectItem>
                  <SelectItem value="Administrador">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                createMutation.mutate({
                  email: addEmail.trim(),
                  password: newPassword,
                  role: addRole,
                })
              }
              disabled={createMutation.isPending || !addEmail.trim() || newPassword.length < 6}
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editUser !== null}
        onOpenChange={(o) => !updateMutation.isPending && !o && setEditUser(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground">{editUser?.email ?? "—"}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role">Perfil</Label>
              <Select
                value={editRole}
                onValueChange={(v) => setEditRole(v as "Usuário" | "Administrador")}
              >
                <SelectTrigger id="edit-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Usuário">Usuário</SelectItem>
                  <SelectItem value="Administrador">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditUser(null)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                editUser &&
                updateMutation.mutate({ userId: editUser.id, role: editRole })
              }
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !deleteMutation.isPending && !o && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir o usuário {deleteTarget?.email ?? "—"}? Esta
              ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


