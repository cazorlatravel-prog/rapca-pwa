<?php
/**
 * RAPCA Campo — Helper de subida a Cloudinary
 */
declare(strict_types=1);

require_once __DIR__ . '/config.php';

/**
 * Subir imagen a Cloudinary.
 * @param string $base64 Imagen en base64 (con o sin prefijo data:image/...)
 * @param string $folder Carpeta en Cloudinary (ej: rapca/VP/UNIDAD1)
 * @param string $publicId ID público (ej: UNIDAD1_VP_G_001)
 * @return array|false Respuesta de Cloudinary o false si falla
 */
function uploadToCloudinary(string $base64, string $folder, string $publicId): array|false {
    if (CLOUDINARY_CLOUD_NAME === '' || CLOUDINARY_API_KEY === '') {
        return false;
    }

    // Asegurar prefijo data:image
    if (!str_starts_with($base64, 'data:')) {
        $base64 = 'data:image/jpeg;base64,' . $base64;
    }

    $timestamp = time();
    $paramsToSign = [
        'folder'    => $folder,
        'public_id' => $publicId,
        'timestamp' => $timestamp,
    ];

    // Generar firma
    ksort($paramsToSign);
    $signString = http_build_query($paramsToSign) . CLOUDINARY_API_SECRET;
    $signature = sha1($signString);

    $url = 'https://api.cloudinary.com/v1_1/' . CLOUDINARY_CLOUD_NAME . '/image/upload';

    $postData = [
        'file'      => $base64,
        'folder'    => $folder,
        'public_id' => $publicId,
        'timestamp' => $timestamp,
        'api_key'   => CLOUDINARY_API_KEY,
        'signature' => $signature,
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $postData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error || $httpCode >= 400) {
        error_log("Cloudinary upload error: {$error} (HTTP {$httpCode}) - {$response}");
        return false;
    }

    $result = json_decode($response, true);
    return $result ?: false;
}

/**
 * Construir URL de Cloudinary para una foto.
 */
function cloudinaryUrl(string $publicId, int $width = 0, int $height = 0, int $quality = 80): string {
    if (CLOUDINARY_CLOUD_NAME === '') return '';

    $transform = '';
    if ($width > 0 || $height > 0) {
        $parts = [];
        if ($width > 0) $parts[] = "w_{$width}";
        if ($height > 0) $parts[] = "h_{$height}";
        $parts[] = "c_fill";
        $parts[] = "q_{$quality}";
        $transform = implode(',', $parts) . '/';
    }

    return "https://res.cloudinary.com/" . CLOUDINARY_CLOUD_NAME . "/image/upload/{$transform}{$publicId}";
}
