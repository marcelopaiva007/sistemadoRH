import { redirect } from "next/navigation";

// Página legada — mantida como redirect para evitar links externos quebrados
// (e-mails antigos, favoritos, integrações). A tela de cadastro vive em
// /cadastros/usuarios.
export default function UsuariosPage() {
  redirect("/cadastros/usuarios");
}