/* Recuperación de accesos para Fitosanidad PWA.
 * Uso manual desde Google Apps Script.
 * NO borra evaluaciones ni modifica las hojas oficiales.
 */

function resetAllAccessAndProvisionAdmin() {
  setupFitosanidad();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = spreadsheet_();
    const usersSheet = ensureControlSheet_(ss, 'USUARIOS_SYNC', USER_HEADERS);
    const previousUsers = listUsers_();
    const revokedCount = previousUsers.length;

    // Revoca todos los perfiles centrales conservando cabeceras/formato.
    const lastRow = usersSheet.getLastRow();
    if (lastRow > 1) {
      usersSheet.getRange(2, 1, lastRow - 1, USER_HEADERS.length).clearContent();
    }

    // Invalida todos los códigos QR/códigos temporales todavía pendientes.
    const activationsRevoked = revokeActivationsForUser_('');

    audit_(
      'RESET_ACCESS_CONTROL',
      'SYSTEM_RESET',
      '',
      'SECURITY',
      revokedCount + ' usuario(s) y ' + activationsRevoked + ' activación(es) revocados. Evaluaciones conservadas.'
    );

    // Crea de cero al Administrador principal.
    registerUser_({
      id: 'ADM-001',
      username: 'admin',
      name: 'Administrador principal',
      role: 'ADMIN'
    });

    const activation = issueActivation_('ADM-001', 'SYSTEM_RESET');
    const result = adminRecoveryResult_(activation, {
      revokedUsers: revokedCount,
      revokedActivations: activationsRevoked,
      message: 'Accesos reiniciados. Usa el código temporal para volver a activar el Administrador principal.'
    });

    console.log('RESET_ADMIN=' + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/*
 * Genera OTRO código para ADM-001 sin volver a borrar usuarios ni evaluaciones.
 * Úsalo si el código anterior venció, fue consumido o la activación local no terminó.
 */
function generateFreshAdminActivation() {
  setupFitosanidad();

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const admin = findUser_('ADM-001');
    if (!admin) {
      throw new Error('ADM-001 no existe. Ejecuta resetAllAccessAndProvisionAdmin() una sola vez.');
    }
    if (admin.role !== 'ADMIN') {
      throw new Error('ADM-001 existe pero no tiene rol ADMIN. Revisa USUARIOS_SYNC antes de continuar.');
    }
    if (!admin.active) {
      setUserActive_('ADM-001', true);
    }

    // Elimina únicamente códigos pendientes asociados al Administrador.
    const revokedActivations = revokeActivationsForUser_('ADM-001');
    const activation = issueActivation_('ADM-001', 'ADMIN_RECOVERY');

    audit_(
      'ADMIN_RECOVERY_CODE',
      'ADMIN_RECOVERY',
      'ADM-001',
      'ADMIN',
      'Nuevo código temporal generado; ' + revokedActivations + ' código(s) anterior(es) revocados.'
    );

    const result = adminRecoveryResult_(activation, {
      revokedUsers: 0,
      revokedActivations: revokedActivations,
      message: 'Nuevo código de recuperación generado. No reinicia usuarios ni evaluaciones.'
    });

    console.log('ADMIN_RECOVERY=' + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

/*
 * Devuelve un diagnóstico SIN tokens ni códigos. Sirve para comprobar que
 * el Administrador existe y cuántas activaciones pendientes hay en ESTE
 * proyecto de Apps Script.
 */
function checkAdminRecoveryStatus() {
  setupFitosanidad();
  const admin = findUser_('ADM-001');
  const props = PropertiesService.getScriptProperties().getProperties();
  let pendingAdminActivations = 0;

  Object.keys(props).forEach(function(key) {
    if (key.indexOf(ACTIVATION_PREFIX) !== 0) return;
    try {
      const item = JSON.parse(props[key]);
      if (clean_(item.userId).toUpperCase() === 'ADM-001' && new Date(item.expiresAt).getTime() > Date.now()) {
        pendingAdminActivations++;
      }
    } catch (error) {}
  });

  const result = {
    ok: true,
    adminExists: !!admin,
    adminActive: !!(admin && admin.active),
    adminRole: admin ? admin.role : '',
    pendingAdminActivations: pendingAdminActivations,
    spreadsheetConfigured: !!PropertiesService.getScriptProperties().getProperty(SPREADSHEET_ID_PROPERTY)
  };
  console.log('ADMIN_STATUS=' + JSON.stringify(result));
  return result;
}

function revokeActivationsForUser_(userId) {
  const wanted = clean_(userId).toUpperCase();
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  let revoked = 0;

  Object.keys(allProps).forEach(function(key) {
    if (key.indexOf(ACTIVATION_PREFIX) !== 0) return;
    if (!wanted) {
      props.deleteProperty(key);
      revoked++;
      return;
    }
    try {
      const item = JSON.parse(allProps[key]);
      if (clean_(item.userId).toUpperCase() === wanted) {
        props.deleteProperty(key);
        revoked++;
      }
    } catch (error) {
      props.deleteProperty(key);
      revoked++;
    }
  });
  return revoked;
}

function adminRecoveryResult_(activation, extra) {
  return {
    ok: true,
    adminId: 'ADM-001',
    username: 'admin',
    revokedUsers: Number(extra.revokedUsers || 0),
    revokedActivations: Number(extra.revokedActivations || 0),
    activationCode: activation.code,
    expiresAt: activation.expiresAt,
    message: clean_(extra.message)
  };
}
