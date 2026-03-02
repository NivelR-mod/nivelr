export interface ContactEmailPayload {
  replyEmail: string;
  subject: string;
  message: string;
  senderName?: string;
}

const WEB3FORMS_URL = 'https://api.web3forms.com/submit';

function getSupabaseFunctionUrl(): string | null {
  const explicit = import.meta.env.VITE_CONTACT_FUNCTION_URL?.trim();
  if (explicit) return explicit;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/functions/v1/send-contact-email`;
}

async function sendWithWeb3Forms(payload: ContactEmailPayload): Promise<{ ok: boolean; error?: string }> {
  const accessKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY?.trim();
  if (!accessKey) {
    return { ok: false, error: 'missing_web3forms_key' };
  }

  try {
    const response = await fetch(WEB3FORMS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `[NIVELR] ${payload.subject}`,
        from_name: payload.senderName ?? 'Utilisateur NIVELR',
        email: payload.replyEmail,
        message: payload.message
      })
    });

    if (!response.ok) {
      return { ok: false, error: "Envoi impossible pour l'instant." };
    }

    const data = (await response.json()) as { success?: boolean; message?: string };
    if (!data.success) {
      return { ok: false, error: data.message ?? "Envoi impossible pour l'instant." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Envoi impossible pour l'instant. Vérifie ta connexion." };
  }
}

export async function sendContactEmail(payload: ContactEmailPayload): Promise<{ ok: boolean; error?: string }> {
  const web3FormsKey = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY?.trim();
  const functionUrl = getSupabaseFunctionUrl();

  if (web3FormsKey) {
    const web3formsResult = await sendWithWeb3Forms(payload);
    if (web3formsResult.ok || !functionUrl) {
      return web3formsResult;
    }
  }

  if (!functionUrl) {
    return {
      ok: false,
      error: "Configuration manquante: ajoute VITE_WEB3FORMS_ACCESS_KEY ou configure VITE_CONTACT_FUNCTION_URL."
    };
  }

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: text || "Envoi impossible pour l'instant." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Envoi impossible pour l'instant. Vérifie ta connexion." };
  }
}
