import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface InviteEmailProps {
  projectName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}

export function InviteEmail({
  projectName,
  inviterName,
  role,
  inviteUrl,
}: InviteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You've been invited to {projectName}</Preview>
      <Body style={{ fontFamily: "sans-serif", background: "#f4f4f5", padding: "40px 0" }}>
        <Container style={{ background: "#fff", borderRadius: "8px", padding: "32px", maxWidth: "480px" }}>
          <Heading style={{ fontSize: "20px", marginBottom: "16px" }}>
            Join {projectName}
          </Heading>
          <Text>
            {inviterName} invited you to join <strong>{projectName}</strong> as a <strong>{role}</strong>.
          </Text>
          <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
            <Link
              href={inviteUrl}
              style={{
                background: "#18181b",
                color: "#fff",
                padding: "12px 24px",
                borderRadius: "6px",
                textDecoration: "none",
                fontSize: "14px",
              }}
            >
              Accept Invitation
            </Link>
          </Section>
          <Text style={{ fontSize: "12px", color: "#71717a" }}>
            This invitation expires in 7 days. If you didn't expect this email, you can ignore it.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
