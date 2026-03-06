<?php
/**
 * RAPCA Campo — Migrador de base de datos
 * Ejecutar en navegador: http://localhost:8000/database/migrate.php
 */
declare(strict_types=1);

require_once __DIR__ . '/../includes/config.php';

$pdo = getDB();

echo "<h1>RAPCA Campo — Migración de Base de Datos</h1>";

$files = [
    'schema.sql',
];

foreach ($files as $file) {
    $path = __DIR__ . '/' . $file;
    if (!file_exists($path)) {
        echo "<p style='color:red'>❌ No encontrado: {$file}</p>";
        continue;
    }

    $sql = file_get_contents($path);
    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        fn($s) => $s !== '' && !str_starts_with($s, '--')
    );

    $ok = 0;
    $errors = 0;
    foreach ($statements as $stmt) {
        try {
            $pdo->exec($stmt);
            $ok++;
        } catch (PDOException $e) {
            // Ignorar errores de "ya existe"
            if (!str_contains($e->getMessage(), 'already exists') &&
                !str_contains($e->getMessage(), 'Duplicate')) {
                echo "<p style='color:orange'>⚠ {$file}: " . htmlspecialchars($e->getMessage()) . "</p>";
                $errors++;
            } else {
                $ok++;
            }
        }
    }

    echo "<p style='color:green'>✅ {$file}: {$ok} sentencias ejecutadas";
    if ($errors > 0) echo ", {$errors} errores";
    echo "</p>";
}

echo "<hr><p>Migración completada. <a href='/admin/login.php'>Ir al panel admin</a></p>";
