import { getMyAccountSettings } from "@/server/actions/settings";
import { getMyProfile } from "@/server/actions/me";
import SettingsAccountForm from "./SettingsAccountForm";

export default async function SettingsPage() {
  const [data, profile] = await Promise.all([
    getMyAccountSettings(),
    getMyProfile(),
  ]);

  return (
    <div className="space-y-5">
      <SettingsAccountForm initialData={data} profileData={profile.employee} />
    </div>
  );
}
