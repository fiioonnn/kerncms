import {
	Body,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Text,
} from "@react-email/components";

interface InviteAppEmailProps {
	inviterName: string;
	inviteUrl: string;
}

export default function InviteAppEmail({
	inviterName = "John Doe",
	inviteUrl = "https://example.com/auth?invite=abc123",
}: InviteAppEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>{inviterName} invited you to kerncms</Preview>
			<Body style={body}>
				<Section style={wrapper}>
					<Img
						src="https://kerncms.com/logo-full.svg"
						alt="kerncms"
						height="32"
						style={{ marginBottom: "48px" }}
					/>

					<Heading style={heading}>You've been invited</Heading>

					<Text style={paragraph}>
						<strong style={{ color: "#fafafa" }}>{inviterName}</strong> invited
						you to join <strong style={{ color: "#fafafa" }}>kerncms</strong>.
						Sign in to get started.
					</Text>

					<Link href={inviteUrl} style={button}>
						Sign In
					</Link>

					<Hr style={divider} />

					<Text style={footer}>
						This invitation expires in 7 days. If you didn't expect this email,
						you can safely ignore it.
					</Text>
				</Section>
			</Body>
		</Html>
	);
}

const body = {
	fontFamily:
		"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	background: "#1c1c1e",
	margin: "0",
	padding: "0",
};

const wrapper = {
	maxWidth: "460px",
	margin: "0 auto",
	padding: "60px 32px 48px",
};

const heading = {
	fontSize: "22px",
	fontWeight: "600" as const,
	color: "#fafafa",
	margin: "0 0 12px",
};

const paragraph = {
	fontSize: "15px",
	color: "#a1a1aa",
	margin: "0 0 32px",
	lineHeight: "1.6",
};

const button = {
	display: "inline-block" as const,
	background: "#fafafa",
	color: "#0a0a0a",
	padding: "12px 28px",
	borderRadius: "8px",
	fontSize: "14px",
	fontWeight: "600" as const,
	textDecoration: "none",
	marginBottom: "40px",
};

const divider = {
	borderColor: "#262626",
	margin: "0 0 24px",
};

const footer = {
	fontSize: "13px",
	color: "#52525b",
	margin: "0",
	lineHeight: "1.6",
};
