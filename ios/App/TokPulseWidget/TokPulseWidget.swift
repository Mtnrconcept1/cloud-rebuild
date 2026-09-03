import SwiftUI
import WidgetKit

private let pulseEndpoint = URL(string: "https://www.thetok.ch/functions/v1/tok-pulse-widget")!
private let defaultOpenURL = URL(string: "https://www.thetok.ch/tok-pulse")!

private struct PulseItem: Codable, Hashable {
    let count: Int
    let title: String
    let subtitle: String
    let url: String
}

private struct PulsePayload: Codable, Hashable {
    let version: Int
    let updatedAt: String
    let city: String
    let priority: String
    let reservation: PulseItem
    let flash: PulseItem
    let chefTable: PulseItem
    let antiWaste: PulseItem

    enum CodingKeys: String, CodingKey {
        case version
        case updatedAt = "updated_at"
        case city
        case priority
        case reservation
        case flash
        case chefTable = "chef_table"
        case antiWaste = "anti_waste"
    }

    static let fallback = PulsePayload(
        version: 1,
        updatedAt: ISO8601DateFormatter().string(from: Date()),
        city: "Genève",
        priority: "reservation",
        reservation: PulseItem(count: 0, title: "Trouver une table", subtitle: "Réserver avec TOK", url: "https://www.thetok.ch/recherche?mode=reservation"),
        flash: PulseItem(count: 0, title: "Offres flash", subtitle: "Voir les offres", url: "https://www.thetok.ch/ventes-flash"),
        chefTable: PulseItem(count: 0, title: "La Table du Chef", subtitle: "Drops exclusifs", url: "https://www.thetok.ch/chefs-table"),
        antiWaste: PulseItem(count: 0, title: "Anti-gaspi", subtitle: "Mieux manger", url: "https://www.thetok.ch/anti-gaspi")
    )

    var primary: PulseItem {
        switch priority {
        case "flash": return flash
        case "chef_table": return chefTable
        default: return reservation
        }
    }
}

private struct PulseEntry: TimelineEntry {
    let date: Date
    let payload: PulsePayload
}

private struct PulseProvider: TimelineProvider {
    func placeholder(in context: Context) -> PulseEntry {
        PulseEntry(date: Date(), payload: .fallback)
    }

    func getSnapshot(in context: Context, completion: @escaping (PulseEntry) -> Void) {
        if context.isPreview {
            completion(PulseEntry(date: Date(), payload: .fallback))
            return
        }
        Task {
            completion(PulseEntry(date: Date(), payload: await loadPayload()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PulseEntry>) -> Void) {
        Task {
            let payload = await loadPayload()
            let entry = PulseEntry(date: Date(), payload: payload)
            let refresh = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date().addingTimeInterval(900)
            completion(Timeline(entries: [entry], policy: .after(refresh)))
        }
    }

    private func loadPayload() async -> PulsePayload {
        var request = URLRequest(url: pulseEndpoint)
        request.timeoutInterval = 8
        request.cachePolicy = .returnCacheDataElseLoad
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("TOK-Pulse-Widget/1.0", forHTTPHeaderField: "User-Agent")

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200 ... 299).contains(http.statusCode) else {
                return .fallback
            }
            return try JSONDecoder().decode(PulsePayload.self, from: data)
        } catch {
            return .fallback
        }
    }
}

private struct TokMark: View {
    var compact = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: compact ? 10 : 14, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [Color(red: 0.99, green: 0.72, blue: 0.16), Color(red: 0.96, green: 0.34, blue: 0.05)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            Text("TOK")
                .font(.system(size: compact ? 12 : 16, weight: .black, design: .rounded))
                .foregroundStyle(Color.black.opacity(0.9))
        }
        .frame(width: compact ? 34 : 44, height: compact ? 34 : 44)
    }
}

private struct Metric: View {
    let symbol: String
    let count: Int
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: symbol)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(Color.orange)
                Text(count > 0 ? "\(count)" : "—")
                    .font(.headline.weight(.black))
            }
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct PulseWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PulseEntry

    private var primaryURL: URL {
        URL(string: entry.payload.primary.url) ?? defaultOpenURL
    }

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                small
            case .systemLarge:
                large
            default:
                medium
            }
        }
        .widgetURL(primaryURL)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                TokMark(compact: true)
                Spacer()
                Circle()
                    .fill(Color.green)
                    .frame(width: 8, height: 8)
                    .shadow(color: .green.opacity(0.5), radius: 4)
            }
            Spacer(minLength: 0)
            Text(entry.payload.primary.title)
                .font(.system(.headline, design: .rounded).weight(.black))
                .lineLimit(2)
                .minimumScaleFactor(0.78)
            Text(entry.payload.primary.subtitle)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text("Ouvrir TOK")
                .font(.caption2.weight(.bold))
                .foregroundStyle(Color.orange)
        }
        .padding(14)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(.systemBackground), Color.orange.opacity(0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var medium: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                TokMark()
                VStack(alignment: .leading, spacing: 2) {
                    Text("TOK Pulse")
                        .font(.headline.weight(.black))
                    Text("Maintenant à \(entry.payload.city)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(entry.payload.primary.title)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.orange)
                    .lineLimit(1)
            }
            Divider().opacity(0.55)
            HStack(spacing: 10) {
                Metric(symbol: "fork.knife", count: entry.payload.reservation.count, label: "restaurants")
                Metric(symbol: "bolt.fill", count: entry.payload.flash.count, label: "flash")
                Metric(symbol: "crown.fill", count: entry.payload.chefTable.count, label: "chef")
                Metric(symbol: "leaf.fill", count: entry.payload.antiWaste.count, label: "anti-gaspi")
            }
        }
        .padding(15)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(.systemBackground), Color.orange.opacity(0.07)],
                startPoint: .top,
                endPoint: .bottomTrailing
            )
        }
    }

    private var large: some View {
        VStack(alignment: .leading, spacing: 15) {
            HStack(spacing: 12) {
                TokMark()
                VStack(alignment: .leading, spacing: 2) {
                    Text("TOK Pulse")
                        .font(.title3.weight(.black))
                    Text("Les raccourcis vivants de TOK")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            Link(destination: URL(string: entry.payload.reservation.url) ?? defaultOpenURL) {
                pulseRow(symbol: "fork.knife", item: entry.payload.reservation)
            }
            Link(destination: URL(string: entry.payload.flash.url) ?? defaultOpenURL) {
                pulseRow(symbol: "bolt.fill", item: entry.payload.flash)
            }
            Link(destination: URL(string: entry.payload.chefTable.url) ?? defaultOpenURL) {
                pulseRow(symbol: "crown.fill", item: entry.payload.chefTable)
            }
            Link(destination: URL(string: entry.payload.antiWaste.url) ?? defaultOpenURL) {
                pulseRow(symbol: "leaf.fill", item: entry.payload.antiWaste)
            }

            Spacer(minLength: 0)
            Text("Données publiques TOK · actualisation automatique")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(.systemBackground), Color.orange.opacity(0.08)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private func pulseRow(symbol: String, item: PulseItem) -> some View {
        HStack(spacing: 10) {
            Image(systemName: symbol)
                .frame(width: 30, height: 30)
                .background(Color.orange.opacity(0.12), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .foregroundStyle(Color.orange)
            VStack(alignment: .leading, spacing: 1) {
                Text(item.title)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(item.subtitle)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .padding(10)
        .background(Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

@main
struct TokPulseWidget: Widget {
    let kind = "TokPulseWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PulseProvider()) { entry in
            PulseWidgetView(entry: entry)
        }
        .configurationDisplayName("TOK Pulse")
        .description("Tables, offres flash, Table du Chef et anti-gaspi directement sur l’écran d’accueil.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
