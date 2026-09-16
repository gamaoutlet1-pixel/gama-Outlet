import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export interface AppUser {
  id: string;
  email: string | null;
  role: string;
  confirmed: boolean;
}

type RoleLabel = "Usuário" | "Administrador";

const toAppRole = (r: string): "admin" | "user" =>
  r === "Administrador" ? "admin" : "user";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden");
}


export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AppUser[]> => {
    await assertAdmin(context);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) throw new Error(error.message);

    const { data: rolesData, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesError) throw new Error(rolesError.message);

    const adminIds = new Set(
      (rolesData ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
    );

    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      role: adminIds.has(u.id)
        ? "Administrador"
        : ((u.user_metadata as { role?: string } | null)?.role ?? "Usuário"),
      confirmed: Boolean(u.email_confirmed_at),
    }));
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const schema = z.object({
      email: z.string().min(1),
      password: z.string().min(6),
      role: z.enum(["Usuário", "Administrador"]),
    });
    return schema.parse(data);
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { role: data.role },
    });
    if (error) throw new Error(error.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Falha ao criar usuário.");

    if (data.role === "Administrador") {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "admin" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
      if (roleError) throw new Error(roleError.message);
    }

    return { id: userId };
  });

export const updateUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { userId: string; role: RoleLabel }) => {
      if (!data.userId) throw new Error("userId é obrigatório.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      user_metadata: { role: data.role },
    });
    if (error) throw new Error(error.message);

    if (data.role === "Administrador") {
      const { error: upsertError } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: data.userId, role: "admin" },
          { onConflict: "user_id,role", ignoreDuplicates: true },
        );
      if (upsertError) throw new Error(upsertError.message);
    } else {
      const { error: delError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (delError) throw new Error(delError.message);
    }

    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { userId: string }) => {
      if (!data.userId) throw new Error("userId é obrigatório.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
