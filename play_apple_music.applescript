#!/usr/bin/env osascript
use framework "Foundation"
use scripting additions

property normalizedTermValue : ""
property notFoundMessageValue : ""
property didAddTracks : false

on run argv
	if (count of argv) < 2 then error my usageMessage()

	set entityType to (item 1 of argv) as text
	set entityType to my lowercaseText(entityType)

	set shuffleEnabled to false
	set searchParts to {}
	set argCount to count of argv
	set argIndex to 2

	repeat while argIndex ≤ argCount
		set argValue to (item argIndex of argv) as text
		if my isShuffleOption(argValue) then
			set parseResult to my parseShuffleOption(argValue, argv, argIndex, argCount)
			set shuffleEnabled to parseResult's shuffle
			set argIndex to argIndex + parseResult's consumed
		else
			set end of searchParts to argValue
			set argIndex to argIndex + 1
		end if
	end repeat

	set searchTerm to my joinWithSpaces(searchParts)

	if searchTerm is "" then error my usageMessage()

	try
		if entityType is "playlist" then
			my playPlaylist(searchTerm, shuffleEnabled)
		else if entityType is "artist" then
			my playCollectionFor("artist", searchTerm, shuffleEnabled)
		else if entityType is "album" then
			my playCollectionFor("album", searchTerm, shuffleEnabled)
		else
			error "Unsupported type \"" & entityType & "\". Expected playlist, artist, or album."
		end if
	on error errMsg number errNum
		error errMsg number errNum
	end try
end run

on usageMessage()
	return "Usage: play_apple_music.applescript <playlist|artist|album> <name> [--shuffle true|false]"
end usageMessage

on lowercaseText(str)
	return ((current application's NSString's stringWithString:str)'s lowercaseString()) as text
end lowercaseText

on joinWithSpaces(wordList)
	if wordList is {} then return ""

	set prevDelims to AppleScript's text item delimiters
	set AppleScript's text item delimiters to space
	try
		set joined to wordList as text
	on error
		set joined to ""
	end try
	set AppleScript's text item delimiters to prevDelims
	return joined
end joinWithSpaces

on isShuffleOption(argValue)
	set normalizedArg to my lowercaseText(argValue)
	if normalizedArg is "--shuffle" then return true
	if normalizedArg is "--no-shuffle" then return true
	if (offset of "--shuffle=" in normalizedArg) is 1 then return true
	return false
end isShuffleOption

on parseShuffleOption(optionArg, argv, argIndex, totalArgs)
	set normalizedOption to my lowercaseText(optionArg)
	if normalizedOption is "--no-shuffle" then
		return {shuffle:false, consumed:1}
	else if (offset of "--shuffle=" in normalizedOption) is 1 then
		set eqIndex to offset of "=" in normalizedOption
		set valueText to text (eqIndex + 1) thru -1 of optionArg
		if valueText is "" then error "Missing value for --shuffle option."
		set boolValue to my parseBoolean(valueText)
		return {shuffle:boolValue, consumed:1}
	else if normalizedOption is "--shuffle" then
		if argIndex < totalArgs then
			set nextArg to (item (argIndex + 1) of argv) as text
			if my looksLikeBoolean(nextArg) then
				set boolValue to my parseBoolean(nextArg)
				return {shuffle:boolValue, consumed:2}
			end if
		end if
		return {shuffle:true, consumed:1}
	else
		error "Invalid shuffle option \"" & optionArg & "\"."
	end if
end parseShuffleOption

on looksLikeBoolean(str)
	try
		my parseBoolean(str)
		return true
	on error
		return false
	end try
end looksLikeBoolean

on parseBoolean(str)
	set normalized to my lowercaseText(str)
	if normalized is in {"true", "1", "yes", "on"} then return true
	if normalized is in {"false", "0", "no", "off"} then return false
	error "Invalid boolean value \"" & str & "\". Use true or false."
end parseBoolean

on playPlaylist(playlistName, shuffleEnabled)
	tell application "Music"
		if not (exists playlist playlistName) then error "Playlist \"" & playlistName & "\" not found."
		set |shuffle enabled| to shuffleEnabled
		play playlist playlistName
	end tell
end playPlaylist

on playCollectionFor(collectionKind, searchTerm, shuffleEnabled)
	set queueName to "Automation Queue"
	set isArtist to (collectionKind is "artist")
	set isAlbum to (collectionKind is "album")
	if not (isArtist or isAlbum) then error "Invalid collection kind."
	set didAddTracks to false

	if isArtist then
		set notFoundMessageValue to "No tracks found for artist \"" & searchTerm & "\"."
	else
		set notFoundMessageValue to "No tracks found for album \"" & searchTerm & "\"."
	end if

	set normalizedTermValue to my lowercaseText(searchTerm)

	tell application "Music"
		set libraryPlaylist to library playlist 1
		set allTracks to every track of libraryPlaylist
		set trackList to {}

		repeat with trackRef in allTracks
			set trackValue to missing value
			try
				if isArtist then
					set trackValue to artist of trackRef
				else
					set trackValue to album of trackRef
				end if
			on error
				set trackValue to missing value
			end try

			if my textMatches(trackValue, normalizedTermValue) then
				set end of trackList to trackRef
			end if
		end repeat

		if trackList is {} then
			set didAddTracks to false
		else
			if not (exists playlist queueName) then
				make new playlist with properties {name:queueName}
			end if

			delete (every track of playlist queueName)

			set addedCount to 0
			repeat with trackRef in trackList
				try
					duplicate trackRef to playlist queueName
					set addedCount to addedCount + 1
				end try
			end repeat

			if addedCount > 0 then
				set didAddTracks to true
				set |shuffle enabled| to shuffleEnabled
				play playlist queueName
			else
				set didAddTracks to false
			end if
		end if
	end tell
	if not didAddTracks then error notFoundMessageValue
end playCollectionFor

on textMatches(value, normalizedNeedle)
	if value is missing value then return false
	set valueText to (value as text)
	if valueText is "" then return false

	set normalizedValue to my lowercaseText(valueText)
	return normalizedValue contains normalizedNeedle
end textMatches
