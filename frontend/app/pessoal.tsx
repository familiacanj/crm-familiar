import { Redirect } from "expo-router";

// The personal view now lives in the Home area switcher; keep old links working.
export default function PersonalHomeRedirect() {
  return <Redirect href="/" />;
}
