# SeatSync Mobile (React Native)

A React Native (Expo) port of the SeatSync web client. Every screen, query key, endpoint and payload matches the web app,
and the styling comes from the web CSS **phone breakpoints** (<= 480px / <= 760px). All tokens live in `src/theme/index.js`.

## Run it

```bash
npm install
npx expo install @expo/vector-icons @react-native-community/datetimepicker expo-secure-store \
  react-native-safe-area-context react-native-screens
npm install @react-navigation/native @react-navigation/native-stack @tanstack/react-query socket.io-client
npx expo start
```

Set the backend URL in `src/config.js` (or `EXPO_PUBLIC_API_URL`):

| Where you run it | URL |
|---|---|
| Android emulator | `http://10.0.2.2:3000` |
| iOS simulator | `http://localhost:3000` |
| Physical device | `http://<your-computer-LAN-IP>:3000` |

## Integrating into your app

Easiest: render `<SeatSyncApp />` (see `App.js`).

Already have providers/navigation? Copy `src/` and mount: `SafeAreaProvider > QueryClientProvider > AuthProvider > AppNavigator`
plus `<ToastHost />` once. If you own the `NavigationContainer`, lift `AppShell`/`AuthFlow` out of
`src/navigation/AppNavigator.js` and drop them into your navigator.

Not on Expo? Only two files are Expo-specific: `src/api/storage.js` (SecureStore -> swap for Keychain/AsyncStorage)
and the `@expo/vector-icons` import in `Sidebar.js` (same API as `react-native-vector-icons/FontAwesome5`).

## What changed from the web app (and why)

| Web | Mobile |
|---|---|
| httpOnly cookie auth | Bearer tokens in SecureStore. The backend already returns `accessToken`/`refreshToken` and accepts `{refreshToken}` on `/api/auth/refresh`, so **no backend change is needed**. |
| React Router + sidebar | React Navigation + the web's off-canvas mobile drawer (300px / screen-56, 0.22s slide, same groups and role lists) |
| `<select>`, ScrollableSelect, SearchableSelect | One `Select` bottom-sheet (search, multi-select) |
| `<input type=date/time>` | `DateField` / `TimeField`; same `YYYY-MM-DD` / `HH:MM` strings |
| Tables | `DataTable`: horizontal scroll, 700px min width, 12/10 cell padding, like the web phone view |
| Modals | `Sheet` bottom sheet (same backdrop, radii, 16px padding, max 92% height) |
| react-toastify | `toast.success/error/info` + `<ToastHost/>` |
| Legacy localStorage draft import | Dropped (a fresh install has none) |
| Exams / Timetable inline editor | Opens in a bottom sheet instead of scrolling the page |

## Appearance and typography

The mobile app uses the web app's navy-and-cream palette, navy sidebar, and
role-specific accent colors. Choose light or dark mode from **Settings >
Appearance**; the preference is saved on the device. The signed-in role
automatically selects the matching student/class representative, lecturer, or
admin accent.

Orbitron is used for headings and buttons, and Lexend for body copy and form
controls. Shared colors, typography, and mobile layout tokens are defined in
`src/theme/index.js`.

## Things to know

- **Not run on a device.** I could only lint and verify imports here (all clean). Expect to nudge a few pixel details on first run.
- Students table: the web header order didn't match its cells (the "Student ID" column held emails). I labelled columns to match the data.
- Cohorts table: the web hid the cohort name for non-admins and showed the Actions header only to admins. I always show the name and show Actions only to admins.
- Academic setup "Export" button does nothing in the web either; it is kept as a placeholder.
- Dashboard stat cards use a flat colour (midpoint of the web's subtle gradient) to avoid a gradient dependency.
