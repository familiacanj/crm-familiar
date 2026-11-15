import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { api } from "@/src/api";
import { supabase } from "@/src/supabase";

export async function exportExcel(year: number, scope: "family" | "personal" = "family") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Entre novamente para exportar seus dados.");
  const endpoint = scope === "personal" ? `personal/export/${year}.xlsx` : `export/${year}.xlsx`;
  const url = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/${endpoint}`;
  const headers = { Authorization: `Bearer ${session.access_token}` };
  if (Platform.OS === "web") {
    if (scope === "personal") {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error("Não foi possível exportar suas finanças pessoais.");
      const objectUrl = window.URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `minhas_financas_${year}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1000);
      return;
    }
    const familyUrl = `${url}?token=${encodeURIComponent(session.access_token)}`;
    window.open(familyUrl, "_blank");
    return;
  }
  const file = new File(Paths.cache, `${scope === "personal" ? "minhas_financas" : "orcamento_familia"}_${year}.xlsx`);
  if (file.exists) file.delete();
  const downloaded = await File.downloadFileAsync(url, file, { headers });
  await Sharing.shareAsync(downloaded.uri, {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    UTI: "org.openxmlformats.spreadsheetml.sheet",
    dialogTitle: "Planilha do orçamento",
  });
}

export async function exportPdf(year: number, scope: "family" | "personal" = "family") {
  const path = scope === "personal" ? `/personal/export/${year}/html` : `/export/${year}/html`;
  const { html } = await api<{ html: string }>(path);
  if (Platform.OS === "web") {
    const w = window.open("", "_blank");
    if (!w) throw new Error("Permita janelas pop-up para gerar o PDF.");
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "PDF do orçamento" });
}
