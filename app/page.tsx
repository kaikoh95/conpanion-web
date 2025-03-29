import Hero from "@/components/hero";
import ConnectSupabaseSteps from "@/components/tutorial/connect-supabase-steps";
import SignUpUserSteps from "@/components/tutorial/sign-up-user-steps";
import { hasEnvVars } from "@/utils/supabase/check-env-vars";

export default function Home() {
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Conpanion</h1>
      <p className="text-gray-600">
        Your construction companion for managing tasks, forms, and site diaries.
      </p>
    </div>
  );
}
