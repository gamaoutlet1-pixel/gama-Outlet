export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      configuracoes: {
        Row: {
          chave: string
          id: string
          updated_at: string
          valor: string | null
        }
        Insert: {
          chave: string
          id?: string
          updated_at?: string
          valor?: string | null
        }
        Update: {
          chave?: string
          id?: string
          updated_at?: string
          valor?: string | null
        }
        Relationships: []
      }
      lotes: {
        Row: {
          id: string
          importado_em: string
          nome_arquivo: string | null
          numero: string
          total_produtos: number
          total_unidades: number
          user_id: string | null
          valor_total: number
        }
        Insert: {
          id?: string
          importado_em?: string
          nome_arquivo?: string | null
          numero: string
          total_produtos?: number
          total_unidades?: number
          user_id?: string | null
          valor_total?: number
        }
        Update: {
          id?: string
          importado_em?: string
          nome_arquivo?: string | null
          numero?: string
          total_produtos?: number
          total_unidades?: number
          user_id?: string | null
          valor_total?: number
        }
        Relationships: []
      }
      movimentacoes: {
        Row: {
          codigo_ml: string | null
          created_at: string
          destino: string | null
          id: string
          lote_id: string | null
          preco_venda: number | null
          produto_id: string | null
        }
        Insert: {
          codigo_ml?: string | null
          created_at?: string
          destino?: string | null
          id?: string
          lote_id?: string | null
          preco_venda?: number | null
          produto_id?: string | null
        }
        Update: {
          codigo_ml?: string | null
          created_at?: string
          destino?: string | null
          id?: string
          lote_id?: string | null
          preco_venda?: number | null
          produto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria: string | null
          codigo_ml: string | null
          codigo_rz: string | null
          criado_em: string
          descricao: string
          destino: string | null
          grade: string | null
          id: string
          lote_id: string
          nome_etiqueta: string | null
          porcentagem_custo: number
          preco_venda: number
          quantidade: number
          sku: string | null
          subcategoria: string | null
          tiny_id: string | null
          tiny_status: string | null
          user_id: string | null
          valor_total: number
          valor_unit: number
        }
        Insert: {
          categoria?: string | null
          codigo_ml?: string | null
          codigo_rz?: string | null
          criado_em?: string
          descricao: string
          destino?: string | null
          grade?: string | null
          id?: string
          lote_id: string
          nome_etiqueta?: string | null
          porcentagem_custo?: number
          preco_venda?: number
          quantidade?: number
          sku?: string | null
          subcategoria?: string | null
          tiny_id?: string | null
          tiny_status?: string | null
          user_id?: string | null
          valor_total?: number
          valor_unit?: number
        }
        Update: {
          categoria?: string | null
          codigo_ml?: string | null
          codigo_rz?: string | null
          criado_em?: string
          descricao?: string
          destino?: string | null
          grade?: string | null
          id?: string
          lote_id?: string
          nome_etiqueta?: string | null
          porcentagem_custo?: number
          preco_venda?: number
          quantidade?: number
          sku?: string | null
          subcategoria?: string | null
          tiny_id?: string | null
          tiny_status?: string | null
          user_id?: string | null
          valor_total?: number
          valor_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "produtos_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
