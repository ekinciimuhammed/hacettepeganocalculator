<?php
// Simple Global Counter API

// Configuration
$file = 'count.txt';
$secretKey = 'Bendis_Super_Secret_Key_2024'; // Basit güvenlik anahtarı

// Allow CORS (Adjust if needed for specific domains)
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

// Check if file exists, if not create it
if (!file_exists($file)) {
    file_put_contents($file, '0');
}

// Handle GET Request (Read Count)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $value = file_get_contents($file);
    // Trim whitespace and ensure valid integer
    $count = (int)trim($value);
    echo json_encode(['count' => $count]);
    exit;
}

// Handle POST Request (Increment Count)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get JSON input
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Check Secret Key (Basic Security)
    if (!isset($input['key']) || $input['key'] !== $secretKey) {
        http_response_code(403);
        echo json_encode(['error' => 'Unauthorized']);
        exit;
    }

    // Critical Section: Read, Increment, Write
    // Use file locking to prevent race conditions
    $fp = fopen($file, 'r+');
    
    if (flock($fp, LOCK_EX)) { // Acquire exclusive lock
        $content = fread($fp, filesize($file) ?: 1); // handle empty file
        $currentCount = (int)trim($content);
        $newCount = $currentCount + 1;
        
        ftruncate($fp, 0);      // Troncate file
        rewind($fp);            // Go to beginning
        fwrite($fp, (string)$newCount); // Write new value
        fflush($fp);            // Flush output
        flock($fp, LOCK_UN);    // Release lock
        
        echo json_encode(['success' => true, 'new_count' => $newCount]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Could not lock file']);
    }
    
    fclose($fp);
    exit;
}

// Method Not Allowed
http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
?>
