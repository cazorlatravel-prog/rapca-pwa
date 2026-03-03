<?php
// Ejecutar una vez para crear las tablas necesarias
require_once __DIR__ . '/config.php';

try {
    $db = getDB();

    $db->exec("CREATE TABLE IF NOT EXISTS rapca_fotos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(100) NOT NULL,
        url_cloudinary VARCHAR(500),
        public_id VARCHAR(200),
        unidad VARCHAR(50),
        tipo VARCHAR(10),
        subtipo VARCHAR(20),
        lat DECIMAL(10,6),
        lon DECIMAL(10,6),
        fecha DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_unidad (unidad),
        INDEX idx_tipo (tipo),
        INDEX idx_codigo (codigo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $db->exec("CREATE TABLE IF NOT EXISTS rapca_capas_kml (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(200) NOT NULL,
        contenido_kml LONGTEXT,
        color VARCHAR(20) DEFAULT '#8b5cf6',
        visible TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    jsonResponse(['ok' => true, 'message' => 'Tablas creadas correctamente']);
} catch (Exception $e) {
    jsonError('Error creando tablas: ' . $e->getMessage(), 500);
}
