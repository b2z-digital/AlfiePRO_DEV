export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ClubRole = 'admin' | 'editor' | 'viewer';

// Generic table structure that allows any fields
type GenericTable = {
  Row: { [key: string]: any }
  Insert: { [key: string]: any }
  Update: { [key: string]: any }
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      clubs: GenericTable
      user_clubs: GenericTable
      invitations: GenericTable
      venues: GenericTable
      quick_races: GenericTable
      race_series: GenericTable
      members: GenericTable
      profiles: GenericTable
      articles: GenericTable
      race_reports: GenericTable
      event_attendance: GenericTable
      club_tasks: GenericTable
      task_attachments: GenericTable
      task_comments: GenericTable
      website_media: GenericTable
      member_invitations: GenericTable
      membership_applications: GenericTable
      committee_positions: GenericTable
      club_requests: GenericTable
      membership_transactions: GenericTable
      club_setup_applications: GenericTable
      classifieds: GenericTable
      notifications: GenericTable
      event_media: GenericTable
      race_forms: GenericTable
      form_fields: GenericTable
      form_submissions: GenericTable
      finance_categories: GenericTable
      finance_transactions: GenericTable
      finance_invoices: GenericTable
      finance_invoice_items: GenericTable
      finance_budgets: GenericTable
      meetings: GenericTable
      meeting_attendees: GenericTable
      meeting_agenda_items: GenericTable
      meeting_minutes: GenericTable
      archived_members: GenericTable
      // Add catch-all for any other tables
      [key: string]: GenericTable
    }
    Views: {
      [key: string]: {
        Row: { [key: string]: any }
        Relationships: []
      }
    }
    Functions: {
      accept_member_invitation: {
        Args: { invitation_token: string }
        Returns: Json
      }
      update_user_email: {
        Args: { user_id: string; new_email: string }
        Returns: Json
      }
      [key: string]: {
        Args: { [key: string]: any }
        Returns: any
      }
    }
    Enums: {
      club_role: ClubRole
      [key: string]: any
    }
    CompositeTypes: {
      [key: string]: any
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"])
  ? (Database["public"]["Tables"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never
