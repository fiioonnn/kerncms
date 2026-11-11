import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { Description, Field, Input, Label } from "@/components/ui/field";

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-foreground text-lg font-bold text-white">
            k
          </span>
          <span className="text-2xl font-semibold tracking-tight">kerncms</span>
        </div>

        <Card className="w-full p-8">
          <div className="mb-7 flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Anmelden</h1>
            <p className="text-[15px] text-muted">Wir schicken dir einen Anmeldelink per E-Mail.</p>
          </div>
          <div className="flex flex-col gap-6">
            <Field>
              <Label>E-Mail</Label>
              <Input type="email" autoComplete="email" />
              <Description>Die Adresse, mit der du eingeladen wurdest.</Description>
            </Field>
            <Button size="lg" className="w-full">
              Anmeldelink senden
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
