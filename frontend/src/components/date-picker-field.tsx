import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { makeStyles, useTheme } from "@/src/theme";
import { FONT, Icon, Tap } from "@/src/ui";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  testID: string;
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function todayLocalIso() {
  const now = new Date();
  return [String(now.getFullYear()).padStart(4, "0"), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

export function formatBrazilianDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function isoFromParts(year: number, monthIndex: number, day: number) {
  return [String(year).padStart(4, "0"), String(monthIndex + 1).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

export function DatePickerField({ value, onChange, label, testID }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [shownMonth, setShownMonth] = useState(() => {
    const selected = parseIsoDate(value);
    return new Date(selected.getFullYear(), selected.getMonth(), 1);
  });
  const year = shownMonth.getFullYear();
  const monthIndex = shownMonth.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const days: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  while (days.length % 7) days.push(null);

  const openCalendar = () => {
    const selected = parseIsoDate(value);
    setShownMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setVisible(true);
  };

  const shiftMonth = (delta: number) => {
    setShownMonth(new Date(year, monthIndex + delta, 1));
  };

  return <>
    <Tap testID={`${testID}-open`} onPress={openCalendar} style={styles.field}>
      <Text accessibilityLabel={label} style={styles.fieldValue}>{formatBrazilianDate(value)}</Text>
      <Icon name="calendar-month" size={23} color={colors.brandPrimary} />
    </Tap>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar calendário" style={styles.backdrop} onPress={() => setVisible(false)} />
        <View style={styles.calendar} testID={`${testID}-calendar`}>
          <View style={styles.calendarHeader}>
            <Tap testID={`${testID}-previous-month`} onPress={() => shiftMonth(-1)} style={styles.monthButton}><Icon name="chevron-left" size={24} color={colors.onSurface} /></Tap>
            <Text style={styles.monthTitle}>{MONTHS[monthIndex]} de {year}</Text>
            <Tap testID={`${testID}-next-month`} onPress={() => shiftMonth(1)} style={styles.monthButton}><Icon name="chevron-right" size={24} color={colors.onSurface} /></Tap>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
            {days.map((day, index) => day === null ? <View key={`blank-${index}`} style={styles.dayCell} /> : (
              <Tap key={day} testID={`${testID}-day-${day}`} onPress={() => { onChange(isoFromParts(year, monthIndex, day)); setVisible(false); }} style={[styles.dayCell, value === isoFromParts(year, monthIndex, day) && styles.selectedDay]}>
                <Text style={[styles.dayText, value === isoFromParts(year, monthIndex, day) && styles.selectedDayText]}>{day}</Text>
              </Tap>
            ))}
          </View>
          <Tap testID={`${testID}-cancel`} onPress={() => setVisible(false)} style={styles.cancelButton}><Text style={styles.cancelText}>Cancelar</Text></Tap>
        </View>
      </View>
    </Modal>
  </>;
}

const useStyles = makeStyles((c) => ({
  field: { minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldValue: { fontFamily: FONT.regular, fontSize: 16, color: c.onSurface },
  modalRoot: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.42)" },
  calendar: { width: "100%", maxWidth: 380, borderRadius: 22, padding: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  monthButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  monthTitle: { fontFamily: FONT.xbold, fontSize: 18, color: c.onSurface, textTransform: "capitalize" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: "14.2857%", height: 34, textAlign: "center", textAlignVertical: "center", fontFamily: FONT.bold, fontSize: 13, color: c.muted },
  dayCell: { width: "14.2857%", height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21 },
  dayText: { fontFamily: FONT.regular, fontSize: 15, color: c.onSurface },
  selectedDay: { backgroundColor: c.brandPrimary },
  selectedDayText: { fontFamily: FONT.xbold, color: c.onBrandPrimary },
  cancelButton: { marginTop: 12, minHeight: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.successSoft },
  cancelText: { fontFamily: FONT.bold, fontSize: 15, color: c.brandPrimary },
}));
