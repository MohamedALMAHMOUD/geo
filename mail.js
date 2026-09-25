navigator.geolocation.getCurrentPosition(async (position) => {

    const latitude  = position.coords.latitude;
    const longitude = position.coords.longitude;
    const accuracy  = position.coords.accuracy;

    try {
        const response = await fetch("/api/send-location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latitude, longitude, accuracy })
        });

        if (!response.ok) {
            throw new Error("Erreur serveur");
        }

        console.log("Position transmise.");

    } catch (error) {
        console.error("Envoi impossible :", error);
    }

});
