import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { api, Bill } from "@/src/api";
import { brl } from "@/src/format";
import { invalidateAll, useBills } from "@/src/queries";
import { makeStyles, useTheme } from "@/src/theme";
import { FONT, haptic, Icon, Tap } from "@/src/ui";

function dueLabel(b: Bill) {
  const day = Number(b.due_date.slice(8, 10));
  if (b.days_left < 0) return `ATRASADA (era dia ${day})`;
  if (b.days_left === 0) return "Vence HOJE";
  if (b.days_left === 1) return "Vence amanhã";
  return `Vence em ${b.days_left} dias (dia ${day})`;
}

export function BillsCard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const q = useBills();
  const [busy, setBusy] = useState<string | null>(null);

  if (!q.data) return null;

  if (!q.data.has_due_days) {
    return (
      <Tap testID="bills-setup-tip" onPress={() => router.navigate({ pathname: "/lancar", params: { section: "fixed" } })} style={styles.tip}>
        <Icon name="calendar-alert" size={36} color={colors.onBrandSecondary} />
        <Text style={styles.tipText}>Quer lembrete das contas? Toque numa conta e coloque o dia do vencimento.</Text>
      </Tap>
    );
  }

  const togglePaid = async (b: Bill) => {
    const key = `${b.category_id}-${b.year}-${b.month}`;
    setBusy(key);
    try {
      await api("/bills/paid", { method: "PUT", body: { category_id: b.category_id, year: b.year, month: b.month, paid: !b.paid } });
      haptic("success");
      await invalidateAll();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.card} testID="bills-card">
      <View style={styles.head}>
        <Icon name="calendar-clock" size={30} color={colors.onSurface} />
        <Text style={styles.title}>Contas desta semana</Text>
      </View>
      {q.data.bills.length === 0 ? (
        <Text style={styles.none} testID="bills-empty">Nenhuma conta vence nos próximos 7 dias.</Text>
      ) : (
        q.data.bills.map((b) => {
          const key = `${b.category_id}-${b.year}-${b.month}`;
          const urgent = !b.paid && b.days_left <= 1;
          return (
            <View key={key} style={[styles.row, b.paid && styles.rowPaid, urgent && styles.rowUrgent]} testID={`bill-row-${b.category_id}`}>
              <Icon name={b.icon as any} size={30} color={b.paid ? colors.muted : colors.onSurface} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, b.paid && styles.paidText]} numberOfLines={2}>{b.name}</Text>
                <Text style={[styles.due, { color: b.paid ? colors.success : urgent ? colors.error : colors.muted }]} testID={`bill-due-${b.category_id}`}>
                  {b.paid ? "Já foi paga" : dueLabel(b)}
                </Text>
                {b.value ? <Text style={styles.value}>{brl(b.value)}</Text> : null}
              </View>
              <Tap testID={`bill-paid-button-${b.category_id}`} onPress={() => togglePaid(b)} style={[styles.payBtn, b.paid && styles.payBtnOn]}>
                {busy === key ? (
                  <ActivityIndicator color={b.paid ? colors.onSuccess : colors.onBrandPrimary} />
                ) : (
                  <>
                    <Icon name={b.paid ? "check-circle" : "cash-check"} size={24} color={b.paid ? colors.onSuccess : colors.onBrandPrimary} />
                    <Text style={styles.payText}>{b.paid ? "Paga" : "Paguei"}</Text>
                  </>
                )}
              </Tap>
            </View>
          );
        })
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { borderRadius: 20, backgroundColor: c.surfaceSecondary, padding: 16, gap: 10, borderWidth: 1, borderColor: c.border },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontFamily: FONT.xbold, fontSize: 22, color: c.onSurface },
  none: { fontFamily: FONT.bold, fontSize: 18, color: c.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 80, padding: 12, borderRadius: 16, backgroundColor: c.surfaceTertiary },
  rowUrgent: { backgroundColor: c.errorSoft },
  rowPaid: { backgroundColor: c.successSoft },
  name: { fontFamily: FONT.bold, fontSize: 18, color: c.onSurface },
  paidText: { color: c.muted },
  due: { fontFamily: FONT.xbold, fontSize: 16 },
  value: { fontFamily: FONT.bold, fontSize: 16, color: c.onSurface },
  payBtn: {
    minWidth: 104, height: 56, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingHorizontal: 12, backgroundColor: c.brandPrimary,
  },
  payBtnOn: { backgroundColor: c.success },
  payText: { fontFamily: FONT.xbold, fontSize: 17, color: c.onBrandPrimary },
  tip: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: c.brandSecondary },
  tipText: { flex: 1, fontFamily: FONT.bold, fontSize: 17, color: c.onBrandSecondary },
}));
