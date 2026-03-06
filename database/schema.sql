-- ============================================================
-- RAPCA Campo — Schema MySQL 8.0+
-- Base de datos para la PWA de evaluación de medios agropecuarios
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------
-- 1. USUARIOS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    nombre          VARCHAR(150)    NOT NULL,
    email           VARCHAR(255)    NOT NULL,
    password        VARCHAR(255)    NOT NULL COMMENT 'Hash bcrypt',
    rol             ENUM('admin','operador')
                                    NOT NULL DEFAULT 'operador',
    activo          TINYINT(1)      NOT NULL DEFAULT 1,
    ultimo_login    DATETIME        DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_email (email),
    INDEX idx_usuarios_rol (rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 2. INFRAESTRUCTURAS (Unidades / fincas)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS infraestructuras (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    provincia       VARCHAR(100)    DEFAULT NULL,
    id_zona         VARCHAR(50)     DEFAULT NULL,
    id_unidad       VARCHAR(50)     NOT NULL,
    cod_infoca      VARCHAR(50)     DEFAULT NULL,
    nombre          VARCHAR(250)    DEFAULT NULL,
    superficie      VARCHAR(50)     DEFAULT NULL,
    pago_maximo     VARCHAR(50)     DEFAULT NULL,
    municipio       VARCHAR(150)    DEFAULT NULL,
    pn              VARCHAR(100)    DEFAULT NULL COMMENT 'Parque Natural',
    contrato        VARCHAR(100)    DEFAULT NULL,
    vegetacion      VARCHAR(200)    DEFAULT NULL,
    pendiente       VARCHAR(50)     DEFAULT NULL,
    distancia       VARCHAR(50)     DEFAULT NULL,
    lat             DECIMAL(10,7)   DEFAULT NULL,
    lon             DECIMAL(10,7)   DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_infra_unidad (id_unidad),
    INDEX idx_infra_zona (id_zona),
    INDEX idx_infra_provincia (provincia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 3. CAMPOS EXTRA (campos dinámicos para infra y ganaderos)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS campos_extra (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    entidad         ENUM('infraestructura','ganadero') NOT NULL,
    nombre          VARCHAR(150)    NOT NULL,
    slug            VARCHAR(100)    NOT NULL,
    tipo            ENUM('texto','numero','select','checkbox','textarea','fecha')
                                    NOT NULL DEFAULT 'texto',
    opciones        JSON            DEFAULT NULL,
    orden           INT UNSIGNED    NOT NULL DEFAULT 0,
    activo          TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_campo_entidad_slug (entidad, slug),
    INDEX idx_campo_entidad (entidad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 4. VALORES CAMPO EXTRA
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS valores_campo_extra (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    campo_id        INT UNSIGNED    NOT NULL,
    entidad         ENUM('infraestructura','ganadero') NOT NULL,
    entidad_id      INT UNSIGNED    NOT NULL,
    valor           TEXT            DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_valor_campo_entidad (campo_id, entidad, entidad_id),
    CONSTRAINT fk_valor_campo
        FOREIGN KEY (campo_id) REFERENCES campos_extra (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 5. GANADEROS (registros de ganaderos/criadores)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS ganaderos (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    nombre          VARCHAR(250)    NOT NULL,
    nif             VARCHAR(20)     DEFAULT NULL,
    telefono        VARCHAR(20)     DEFAULT NULL,
    email           VARCHAR(255)    DEFAULT NULL,
    direccion       TEXT            DEFAULT NULL,
    municipio       VARCHAR(150)    DEFAULT NULL,
    provincia       VARCHAR(100)    DEFAULT NULL,
    tipo_ganado     VARCHAR(200)    DEFAULT NULL,
    num_cabezas     INT UNSIGNED    DEFAULT NULL,
    observaciones   TEXT            DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_ganadero_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 6. REGISTROS (evaluaciones VP/EL/EI)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS registros (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    tipo            ENUM('VP','EL','EI') NOT NULL,
    fecha           DATE            NOT NULL,
    zona            VARCHAR(100)    DEFAULT NULL,
    unidad          VARCHAR(100)    NOT NULL,
    transecto       TINYINT UNSIGNED DEFAULT NULL COMMENT '1-3 solo para EI',
    datos           JSON            NOT NULL COMMENT 'Datos del formulario completo',
    lat             DECIMAL(10,7)   DEFAULT NULL,
    lon             DECIMAL(10,7)   DEFAULT NULL,
    operador_id     INT UNSIGNED    DEFAULT NULL,
    operador_email  VARCHAR(255)    DEFAULT NULL,
    operador_nombre VARCHAR(150)    DEFAULT NULL,
    enviado         TINYINT(1)      NOT NULL DEFAULT 0,
    enviado_servidor TINYINT(1)     NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_reg_tipo (tipo),
    INDEX idx_reg_unidad (unidad),
    INDEX idx_reg_fecha (fecha),
    INDEX idx_reg_operador (operador_id),
    CONSTRAINT fk_reg_operador
        FOREIGN KEY (operador_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 7. FOTOS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS fotos (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    registro_id     INT UNSIGNED    DEFAULT NULL,
    codigo          VARCHAR(100)    NOT NULL COMMENT 'Ej: UNIDAD_VP_G_001',
    url_cloudinary  VARCHAR(512)    DEFAULT NULL,
    tipo_foto       ENUM('general','comparativa_w1','comparativa_w2') NOT NULL DEFAULT 'general',
    unidad          VARCHAR(100)    DEFAULT NULL,
    tipo_registro   ENUM('VP','EL','EI') DEFAULT NULL,
    lat             DECIMAL(10,7)   DEFAULT NULL,
    lon             DECIMAL(10,7)   DEFAULT NULL,
    subida          TINYINT(1)      NOT NULL DEFAULT 0,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_foto_codigo (codigo),
    INDEX idx_foto_registro (registro_id),
    INDEX idx_foto_unidad (unidad),
    INDEX idx_foto_tipo (tipo_registro),
    CONSTRAINT fk_foto_registro
        FOREIGN KEY (registro_id) REFERENCES registros (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 8. CAPAS KML (persistencia de capas del mapa)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS capas_kml (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    nombre          VARCHAR(200)    NOT NULL,
    contenido       LONGTEXT        NOT NULL COMMENT 'KML XML content',
    color           VARCHAR(7)      DEFAULT '#3388ff',
    grosor          TINYINT UNSIGNED DEFAULT 3,
    opacidad        DECIMAL(3,2)    DEFAULT 0.80,
    visible         TINYINT(1)      NOT NULL DEFAULT 1,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_capa_nombre (nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- 9. ERRORES SUBIDA (log de fallos de upload)
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS errores_subida (
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    codigo_foto     VARCHAR(100)    DEFAULT NULL,
    error           TEXT            DEFAULT NULL,
    usuario_id      INT UNSIGNED    DEFAULT NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------
-- VISTA: registros con info de operador
-- -----------------------------------------------------------
CREATE OR REPLACE VIEW v_registros_completos AS
SELECT
    r.*,
    u.nombre AS op_nombre,
    u.email AS op_email
FROM registros r
LEFT JOIN usuarios u ON r.operador_id = u.id;

-- -----------------------------------------------------------
-- Seed: Admin por defecto
-- Password: Gallito9431%
-- -----------------------------------------------------------
INSERT INTO usuarios (nombre, email, password, rol, activo)
VALUES ('Administrador RAPCA', 'rapcajaen@gmail.com',
        '$2y$12$LZL1Kk1FjL8xrDqLuH5kPuLcZjOz3pQFY5cN3GqC7qVJzJGw1X2Vy',
        'admin', 1)
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

SET FOREIGN_KEY_CHECKS = 1;
