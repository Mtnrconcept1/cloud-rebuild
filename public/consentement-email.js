/* Standalone privacy boundary: no account session, telemetry, browser storage or automatic approval. */
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const token = new URLSearchParams(location.hash.slice(1)).get('token');
  const endpoint = '/functions/v1/commercial-consent-confirmation';
  let busy = false;
  const put = (id, value) => { byId(id).textContent = String(value ?? ''); };
  const format = value => value ? new Date(value).toLocaleString('fr-CH', { timeZone: 'Europe/Zurich' }) : '—';
  function showError(message) { byId('error').hidden = false; put('error', message); }
  function display(value) {
    const labels = { pending: 'Consentement signé — confirmation complémentaire possible', confirmed: 'Confirmé par e-mail', withdrawn: 'Retiré ou bloqué', superseded: 'Remplacé par une nouvelle demande', expired: 'Lien de confirmation expiré' };
    if (!value || !labels[value.state] || !value.document) throw new Error('Réponse du service non valide. Réessayez.');
    const d = value.document;
    put('status', labels[value.state]); put('restaurant', value.restaurant_name);
    put('signer', `${value.signer_name} — ${value.signer_role}`); put('email', value.email);
    put('dates', `Signature : ${format(value.signed_at)}${value.confirmed_at ? ' · Confirmation : ' + format(value.confirmed_at) : ' · Confirmation possible jusqu’au ' + format(value.expires_at)}`);
    put('controller', `${d.controller}\n${d.address}\nContact et retrait : ${d.contact}`);
    put('text', d.text); put('privacy', d.privacy);
    if (typeof value.signature_data === 'string' && value.signature_data.length <= 180000 && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]+$/.test(value.signature_data)) {
      byId('signature').src = value.signature_data; byId('signature').hidden = false;
    } else { byId('signature').hidden = true; byId('signature').removeAttribute('src'); }
    put('reference', `Version : ${d.version} · Référence : ${value.receipt_id}\nEmpreinte de preuve : ${value.proof_hash}`);
    const acknowledgement = {
      queued: 'L’accusé de double confirmation est en file d’envoi.',
      processing: 'L’envoi de l’accusé de double confirmation est en cours.',
      retry: 'Une nouvelle tentative d’envoi de l’accusé est prévue ; votre confirmation est déjà enregistrée.',
      sent: 'L’accusé de double confirmation a été accepté par le service d’envoi.',
      failed: 'L’envoi de l’accusé a échoué ; votre double confirmation reste enregistrée.',
      cancelled: 'L’envoi de l’accusé a été annulé ; le reçu conserve vos choix.'
    }[value.acknowledgement_delivery_state] || 'Votre double confirmation est enregistrée.';
    const instructions = {
      pending: value.email_eligible ? 'Votre signature autorise déjà les e-mails TOK prévus par ce texte. JE CONSENS ajoute une confirmation complémentaire et déclenche un e-mail récapitulatif. Cette étape est facultative.' : 'Votre consentement signé est conservé, mais vos préférences ou les autres règles marketing bloquent actuellement l’envoi. JE CONSENS ajoute seulement une preuve complémentaire et ne contourne pas ces règles.',
      confirmed: (value.email_eligible ? 'Votre consentement signé est maintenant également confirmé par e-mail. Aucun message commercial n’est envoyé par ce clic. ' : 'Votre accord est conservé. Vos préférences ou les autres règles marketing bloquent actuellement l’envoi. ') + acknowledgement,
      withdrawn: 'Cette demande ne permet plus de vous envoyer des campagnes. Un ancien lien ne peut pas réactiver une opposition.',
      superseded: 'Une demande plus récente remplace ce lien. Utilisez le dernier e-mail reçu. Vous pouvez toujours retirer votre autorisation pour cette même adresse.',
      expired: value.email_eligible ? 'Le lien de confirmation complémentaire a expiré. Votre consentement signé reste actif et autorise les e-mails prévus. Vous pouvez le retirer à tout moment.' : 'Le lien complémentaire a expiré. Votre consentement signé est conservé, mais les autres règles marketing bloquent actuellement l’envoi.',
    };
    put('instruction', instructions[value.state]);
    byId('confirm').hidden = value.state !== 'pending';
    byId('withdraw').hidden = value.state === 'withdrawn';
    byId('receipt').hidden = false;
  }
  async function action(name) {
    if (busy) return;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) { byId('loading').hidden = true; showError('Ce lien personnel est invalide. Ouvrez le lien complet depuis l’e-mail TOK.'); return; }
    busy = true; byId('error').hidden = true; byId('retry').hidden = true;
    for (const id of ['confirm', 'withdraw', 'retry']) byId(id).disabled = true;
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, token, ...(name === 'view' ? {} : { agree: true }) }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'La vérification est indisponible. Réessayez.');
      display(result);
    } catch (error) {
      showError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'La vérification est indisponible. Réessayez.');
      byId('retry').hidden = false;
    } finally {
      busy = false; byId('loading').hidden = true;
      for (const id of ['confirm', 'withdraw', 'retry']) byId(id).disabled = false;
    }
  }
  byId('confirm').onclick = () => action('confirm');
  byId('withdraw').onclick = () => { if (window.confirm('Retirer votre autorisation de recevoir les campagnes TOK pour cette adresse ?')) action('withdraw'); };
  byId('retry').onclick = () => action('view');
  byId('print').onclick = () => { document.querySelectorAll('details').forEach(element => { element.open = true; }); window.print(); };
  action('view');
})();
