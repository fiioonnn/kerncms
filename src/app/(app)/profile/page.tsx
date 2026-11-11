import { getProfile } from "@/server/queries";
import { ProfileView } from "./profile-view";

export default async function ProfilePage() {
  const profile = await getProfile();
  return <ProfileView user={profile.user} sessions={profile.sessions} />;
}
