$HOST = "127.0.0.1"
$PORT = 5200

$DECODER = "DECODER01"
$TRANSPONDER = "76698"

$MIN_LAP = 4
$MAX_LAP = 7
$KEEPALIVE = 1   # segundos

while ($true) {
    try {
        Write-Host "🟡 Conectando al TP13..." -ForegroundColor Yellow

        $client = New-Object System.Net.Sockets.TcpClient($HOST, $PORT)
        $stream = $client.GetStream()
        $writer = New-Object System.IO.StreamWriter($stream)
        $writer.AutoFlush = $true

        Write-Host "🟢 Conectado" -ForegroundColor Green

        # 🚦 Marca inicial inmediata
        $writer.WriteLine("$DECODER,$TRANSPONDER,$([DateTime]::UtcNow.ToString("o"))")
        Write-Host "🚦 Marca inicial enviada"

        $nextLap = (Get-Date).AddSeconds(
            Get-Random -Minimum $MIN_LAP -Maximum $MAX_LAP
        )

        while ($true) {
            # 🔄 KEEPALIVE
            $writer.WriteLine("PING,$DECODER")
            Start-Sleep -Seconds $KEEPALIVE

            # 🏁 LAP
            if ((Get-Date) -ge $nextLap) {
                $ts = [DateTime]::UtcNow.ToString("o")
                $writer.WriteLine("$DECODER,$TRANSPONDER,$ts")
                Write-Host "🏁 LAP → $TRANSPONDER"

                $nextLap = (Get-Date).AddSeconds(
                    Get-Random -Minimum $MIN_LAP -Maximum $MAX_LAP
                )
            }
        }
    }
    catch {
        Write-Host "🔴 Conexión caída, reintentando..." -ForegroundColor Red
    }

    Start-Sleep -Seconds 2
}
