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
    const props = PropertiesService.getScriptProperties();
    const allProps = props.getProperties();
    let activationsRevoked = 0;
    Object.keys(allProps).forEach(function(key) {
      if (key.indexOf(ACTIVATION_PREFIX) !== 0) return;
      props.deleteProperty(key);
      activationsRevoked++;
    });

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

    // El Administrador se vincula igual que los demás: código de un solo uso.
    // No se imprime ni se comparte ningún token permanente.
    const activation = issueActivation_('ADM-001', 'SYSTEM_RESET');
    const result = {
      ok: true,
      adminId: 'ADM-001',
      username: 'admin',
      revokedUsers: revokedCount,
      revokedActivations: activationsRevoked,
      activationCode: activation.code,
      expiresAt: activation.expiresAt,
      message: 'Accesos reiniciados. Usa el código temporal para volver a activar el Administrador principal.'
    };

    console.log('RESET_ADMIN=' + JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}
